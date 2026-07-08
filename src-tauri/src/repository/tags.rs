use rusqlite::{params, Connection};
use crate::domain::tag::{TagName, TagClass, TagClassTreeNode};
use crate::error::{AppError, AppResult};


pub fn get_classes(conn: &Connection, library_id: &str) -> AppResult<Vec<TagClass>> {
    let mut stmt = conn.prepare(
        "SELECT c.id,c.library_id,c.parent_id,c.name,c.color,c.icon,c.description,c.sort_order,
                c.created_at,c.updated_at,
                (SELECT COUNT(*) FROM tag_classes WHERE parent_id=c.id) as child_count,
                (SELECT COUNT(*) FROM class_tags WHERE class_id=c.id) as tag_count
         FROM tag_classes c WHERE c.library_id=?1
         ORDER BY c.sort_order,c.name"
    ).map_err(AppError::Db)?;
    let classes = stmt.query_map(params![library_id], |row| {
        Ok(TagClass {
            id: row.get(0)?, library_id: row.get(1)?, parent_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?, icon: row.get(5)?,
            description: row.get(6)?, sort_order: row.get(7)?,
            created_at: row.get(8)?, updated_at: row.get(9)?,
            child_count: row.get(10)?, tag_count: row.get(11)?,
        })
    }).map_err(AppError::Db)?;
    Ok(classes.filter_map(|r| r.ok()).collect())
}

pub fn get_class_by_id(conn: &Connection, id: &str) -> AppResult<TagClass> {
    conn.query_row(
        "SELECT c.id,c.library_id,c.parent_id,c.name,c.color,c.icon,c.description,c.sort_order,
                c.created_at,c.updated_at,
                (SELECT COUNT(*) FROM tag_classes WHERE parent_id=c.id) as child_count,
                (SELECT COUNT(*) FROM class_tags WHERE class_id=c.id) as tag_count
         FROM tag_classes c WHERE c.id=?1",
        params![id],
        |row| Ok(TagClass {
            id: row.get(0)?, library_id: row.get(1)?, parent_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?, icon: row.get(5)?,
            description: row.get(6)?, sort_order: row.get(7)?,
            created_at: row.get(8)?, updated_at: row.get(9)?,
            child_count: row.get(10)?, tag_count: row.get(11)?,
        }),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound { entity: "TagClass", id: id.to_string() },
        e => AppError::Db(e),
    })
}

pub fn insert_class(conn: &Connection, cls: &TagClass) -> AppResult<()> {
    conn.execute(
        "INSERT INTO tag_classes (id,library_id,parent_id,name,color,icon,description,sort_order,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![cls.id, cls.library_id, cls.parent_id, cls.name, cls.color, cls.icon,
                cls.description, cls.sort_order, cls.created_at, cls.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn update_class(conn: &Connection, cls: &TagClass) -> AppResult<()> {
    conn.execute(
        "UPDATE tag_classes SET name=?1,color=?2,icon=?3,description=?4,parent_id=?5,updated_at=?6 WHERE id=?7",
        params![cls.name, cls.color, cls.icon, cls.description, cls.parent_id, cls.updated_at, cls.id],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn delete_class(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute_batch("BEGIN TRANSACTION").map_err(AppError::Db)?;
    let result: AppResult<()> = (|| {
        conn.execute("DELETE FROM video_class_tags WHERE tag_id IN (SELECT id FROM class_tags WHERE class_id=?1)", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM class_tags WHERE class_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("UPDATE tag_classes SET parent_id=NULL WHERE parent_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM tag_classes WHERE id=?1", params![id]).map_err(AppError::Db)?;
        Ok(())
    })();
    match result {
        Ok(_) => { conn.execute_batch("COMMIT").map_err(AppError::Db)?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }
    Ok(())
}

pub fn move_class(conn: &Connection, id: &str, new_parent_id: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE tag_classes SET parent_id=?1,updated_at=?2 WHERE id=?3",
        params![new_parent_id, chrono::Utc::now().to_rfc3339(), id],
    ).map_err(AppError::Db)?;
    Ok(())
}


pub fn get_tags_by_class(conn: &Connection, class_id: &str) -> AppResult<Vec<TagName>> {
    let mut stmt = conn.prepare(
        "SELECT t.id,t.class_id,t.library_id,t.name,t.color,t.sort_order,t.created_at,t.updated_at,
                COALESCE((SELECT COUNT(*) FROM video_class_tags WHERE tag_id=t.id),0),
                COALESCE(t.tag_type,'text')
         FROM class_tags t WHERE t.class_id=?1
         ORDER BY t.sort_order,t.name"
    ).map_err(AppError::Db)?;
    let tags = stmt.query_map(params![class_id], |row| {
        Ok(TagName {
            id: row.get(0)?, class_id: row.get(1)?, library_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?,
            sort_order: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?,
            video_count: row.get(8)?,
            tag_type: row.get(9)?,
        })
    }).map_err(AppError::Db)?;
    Ok(tags.filter_map(|r| r.ok()).collect())
}

pub fn get_all_tags_by_library(conn: &Connection, library_id: &str) -> AppResult<Vec<TagName>> {
    let mut stmt = conn.prepare(
        "SELECT t.id,t.class_id,t.library_id,t.name,t.color,t.sort_order,t.created_at,t.updated_at,
                COALESCE((SELECT COUNT(*) FROM video_class_tags WHERE tag_id=t.id),0),
                COALESCE(t.tag_type,'text')
         FROM class_tags t WHERE t.library_id=?1
         ORDER BY t.sort_order,t.name"
    ).map_err(AppError::Db)?;
    let tags = stmt.query_map(params![library_id], |row| {
        Ok(TagName {
            id: row.get(0)?, class_id: row.get(1)?, library_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?,
            sort_order: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?,
            video_count: row.get(8)?,
            tag_type: row.get(9)?,
        })
    }).map_err(AppError::Db)?;
    Ok(tags.filter_map(|r| r.ok()).collect())
}

pub fn insert_tag(conn: &Connection, tag: &TagName) -> AppResult<()> {
    conn.execute(
        "INSERT INTO class_tags (id,class_id,library_id,name,color,sort_order,tag_type,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![tag.id, tag.class_id, tag.library_id, tag.name, tag.color,
                tag.sort_order, tag.tag_type, tag.created_at, tag.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn update_tag(conn: &Connection, tag: &TagName) -> AppResult<()> {
    conn.execute(
        "UPDATE class_tags SET name=?1,color=?2,sort_order=?3,tag_type=?4,updated_at=?5 WHERE id=?6",
        params![tag.name, tag.color, tag.sort_order, tag.tag_type, chrono::Utc::now().to_rfc3339(), tag.id],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM video_class_tags WHERE tag_id=?1", params![id]).map_err(AppError::Db)?;
    conn.execute("DELETE FROM class_tags WHERE id=?1", params![id]).map_err(AppError::Db)?;
    Ok(())
}

pub fn search_tags(conn: &Connection, query: &str, library_id: &str) -> AppResult<Vec<TagName>> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT t.id,t.class_id,t.library_id,t.name,t.color,t.sort_order,t.created_at,t.updated_at,
                COALESCE((SELECT COUNT(*) FROM video_class_tags WHERE tag_id=t.id),0),
                COALESCE(t.tag_type,'text')
         FROM class_tags t WHERE t.library_id=?1 AND t.name LIKE ?2
         ORDER BY t.sort_order,t.name LIMIT 50"
    ).map_err(AppError::Db)?;
    let tags = stmt.query_map(params![library_id, pattern], |row| {
        Ok(TagName {
            id: row.get(0)?, class_id: row.get(1)?, library_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?,
            sort_order: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?,
            video_count: row.get(8)?,
            tag_type: row.get(9)?,
        })
    }).map_err(AppError::Db)?;
    Ok(tags.filter_map(|r| r.ok()).collect())
}

pub fn get_video_tag_details(conn: &Connection, video_id: &str) -> AppResult<Vec<(TagName, String)>> {
    let mut stmt = conn.prepare(
        "SELECT t.id,t.class_id,t.library_id,t.name,t.color,t.sort_order,t.created_at,t.updated_at,
                COALESCE((SELECT COUNT(*) FROM video_class_tags WHERE tag_id=t.id),0),
                COALESCE(t.tag_type,'text'),
                vt.value
         FROM class_tags t INNER JOIN video_class_tags vt ON vt.tag_id=t.id
         WHERE vt.video_id=?1
         ORDER BY t.sort_order,t.name"
    ).map_err(AppError::Db)?;
    let tags = stmt.query_map(params![video_id], |row| {
        let tag = TagName {
            id: row.get(0)?, class_id: row.get(1)?, library_id: row.get(2)?,
            name: row.get(3)?, color: row.get(4)?,
            sort_order: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?,
            video_count: row.get(8)?,
            tag_type: row.get(9)?,
        };
        let value: String = row.get(10)?;
        Ok((tag, value))
    }).map_err(AppError::Db)?;
    Ok(tags.filter_map(|r| r.ok()).collect())
}


pub fn batch_tag_videos(conn: &Connection, video_ids: &[String], tag_values: &[(String, String)]) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute_batch("BEGIN TRANSACTION").map_err(AppError::Db)?;
    for vid in video_ids {
        for (tid, val) in tag_values {
            if let Err(e) = conn.execute(
                "INSERT OR REPLACE INTO video_class_tags (video_id,tag_id,value,assigned_at) VALUES (?1,?2,?3,?4)",
                params![vid, tid, val, now],
            ) {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(AppError::Db(e));
            }
        }
    }
    conn.execute_batch("COMMIT").map_err(AppError::Db)?;
    Ok(())
}

pub fn get_video_taggings_batch(conn: &Connection, video_ids: &[String]) -> AppResult<Vec<(String, TagName, String)>> {
    if video_ids.is_empty() { return Ok(vec![]); }
    let placeholders: Vec<String> = (0..video_ids.len()).map(|i| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT vt.video_id, t.id, t.class_id, t.library_id, t.name, t.color, t.sort_order,
                t.created_at, t.updated_at,
                COALESCE((SELECT COUNT(*) FROM video_class_tags WHERE tag_id=t.id),0),
                COALESCE(t.tag_type,'text'),
                vt.value
         FROM class_tags t INNER JOIN video_class_tags vt ON vt.tag_id=t.id
         WHERE vt.video_id IN ({})
         ORDER BY vt.video_id, t.sort_order, t.name",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(AppError::Db)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = video_ids.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
    let results = stmt.query_map(refs.as_slice(), |row| {
        let video_id: String = row.get(0)?;
        let tag = TagName {
            id: row.get(1)?, class_id: row.get(2)?, library_id: row.get(3)?,
            name: row.get(4)?, color: row.get(5)?,
            sort_order: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?,
            video_count: row.get(9)?,
            tag_type: row.get(10)?,
        };
        let value: String = row.get(11)?;
        Ok((video_id, tag, value))
    }).map_err(AppError::Db)?;
    Ok(results.filter_map(|r| r.ok()).collect())
}

pub fn batch_remove_tags(conn: &Connection, video_ids: &[String], tag_ids: &[String]) -> AppResult<()> {
    conn.execute_batch("BEGIN TRANSACTION").map_err(AppError::Db)?;
    for vid in video_ids {
        for tid in tag_ids {
            if let Err(e) = conn.execute(
                "DELETE FROM video_class_tags WHERE video_id=?1 AND tag_id=?2",
                params![vid, tid],
            ) {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(AppError::Db(e));
            }
        }
    }
    conn.execute_batch("COMMIT").map_err(AppError::Db)?;
    Ok(())
}

pub fn batch_set_tag_values(conn: &Connection, video_ids: &[String], tag_id: &str, tag_value: &str) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute_batch("BEGIN TRANSACTION").map_err(AppError::Db)?;
    for vid in video_ids {
        if let Err(e) = conn.execute(
            "INSERT OR REPLACE INTO video_class_tags (video_id,tag_id,value,assigned_at) VALUES (?1,?2,?3,?4)",
            params![vid, tag_id, tag_value, now],
        ) {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(AppError::Db(e));
        }
    }
    conn.execute_batch("COMMIT").map_err(AppError::Db)?;
    Ok(())
}

/// 获取某个标签下所有视频已填写的不同值及其使用次数
pub fn get_distinct_tag_values(conn: &Connection, tag_id: &str) -> AppResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT value, COUNT(*) as cnt FROM video_class_tags
         WHERE tag_id=?1 AND value!=''
         GROUP BY value ORDER BY cnt DESC, value ASC"
    ).map_err(AppError::Db)?;
    let rows = stmt.query_map(params![tag_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(AppError::Db)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn cleanup_unused_tags(conn: &Connection, library_id: &str) -> AppResult<i64> {
    let deleted = conn.execute(
        "DELETE FROM class_tags WHERE library_id=?1 AND id NOT IN (SELECT DISTINCT tag_id FROM video_class_tags)",
        params![library_id],
    ).map_err(AppError::Db)?;
    Ok(deleted as i64)
}


pub fn build_tag_tree(conn: &Connection, library_id: &str, parent_id: Option<&str>) -> AppResult<Vec<TagClassTreeNode>> {
    let classes = if let Some(pid) = parent_id {
        let mut stmt = conn.prepare(
            "SELECT id,name,color,icon,(SELECT COUNT(*) FROM class_tags WHERE class_id=tc.id)
             FROM tag_classes tc WHERE library_id=?1 AND parent_id=?2 ORDER BY sort_order,name"
        ).map_err(AppError::Db)?;
        let rows = stmt.query_map(params![library_id, pid], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?))
        }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect::<Vec<_>>();
        rows
    } else {
        let mut stmt = conn.prepare(
            "SELECT id,name,color,icon,(SELECT COUNT(*) FROM class_tags WHERE class_id=tc.id)
             FROM tag_classes tc WHERE library_id=?1 AND parent_id IS NULL ORDER BY sort_order,name"
        ).map_err(AppError::Db)?;
        let rows = stmt.query_map(params![library_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?))
        }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect::<Vec<_>>();
        rows
    };

    let mut nodes = Vec::new();
    for (id, name, color, icon, tag_count) in classes {
        let children = build_tag_tree(conn, library_id, Some(&id))?;
        let tags = get_tags_by_class(conn, &id)?;
        nodes.push(TagClassTreeNode { id, name, color, icon, tag_count, children, tags });
    }
    Ok(nodes)
}


pub fn save_template(conn: &Connection, library_id: &str) -> AppResult<Vec<TagClassTreeNode>> {
    build_tag_tree(conn, library_id, None)
}

fn validate_template_structure(nodes: &[TagClassTreeNode], is_root: bool) -> AppResult<()> {
    for node in nodes {
        if is_root && !node.tags.is_empty() {
            return Err(AppError::Validation {
                field: "template".into(),
                reason: format!("根类 '{}' 下不可直接挂载标签，请先创建子类", node.name),
            });
        }
        validate_template_structure(&node.children, false)?;
    }
    Ok(())
}

pub fn load_template(conn: &Connection, library_id: &str, template_nodes: &[TagClassTreeNode], parent_id: Option<&str>) -> AppResult<()> {

    if parent_id.is_none() {
        validate_template_structure(template_nodes, true)?;
    }
    let now = chrono::Utc::now().to_rfc3339();
    for node in template_nodes {
        let new_id = uuid::Uuid::new_v4().to_string();
        let cls = TagClass {
            id: new_id.clone(),
            library_id: library_id.to_string(),
            parent_id: parent_id.map(|s| s.to_string()),
            name: node.name.clone(),
            color: node.color.clone(),
            icon: node.icon.clone(),
            description: String::new(),
            sort_order: 0,
            created_at: now.clone(),
            updated_at: now.clone(),
            child_count: 0,
            tag_count: 0,
        };
        insert_class(conn, &cls)?;
        for tag in &node.tags {
            let new_tag_id = uuid::Uuid::new_v4().to_string();
            let tn = TagName {
                id: new_tag_id,
                class_id: new_id.clone(),
                library_id: library_id.to_string(),
                name: tag.name.clone(),
                color: tag.color.clone(),
                sort_order: tag.sort_order,
                created_at: now.clone(),
                updated_at: now.clone(),
                video_count: 0,
                tag_type: tag.tag_type.clone(),
            };
            insert_tag(conn, &tn)?;
        }
        load_template(conn, library_id, &node.children, Some(&new_id))?;
    }
    Ok(())
}
