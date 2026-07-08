use rusqlite::{params, Connection};
use crate::domain::category::Category;
use crate::error::{AppError, AppResult};

pub fn get_all(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, COALESCE(c.icon,''), COALESCE(c.note,''),
                c.sort_order, c.is_default, c.is_deletable, COALESCE(c.status,'normal'),
                COALESCE(c.storage_path,''), c.created_at, c.updated_at,
                COALESCE(lib_stats.lib_count,0),
                COALESCE(lib_stats.video_count,0),
                COALESCE(lib_stats.total_size,0),
                COALESCE(lib_stats.total_duration,0.0)
         FROM categories c
         LEFT JOIN (
             SELECT l.category_id,
                    COUNT(DISTINCT l.id) as lib_count,
                    COUNT(v.id) as video_count,
                    COALESCE(SUM(v.size),0) as total_size,
                    COALESCE(SUM(v.duration),0.0) as total_duration
             FROM libraries l
             LEFT JOIN videos v ON v.library_id = l.id
             GROUP BY l.category_id
         ) lib_stats ON lib_stats.category_id = c.id
         ORDER BY c.sort_order, c.created_at"
    ).map_err(AppError::Db)?;
    let cats = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?, name: row.get(1)?, icon: row.get(2)?, note: row.get(3)?,
            sort_order: row.get(4)?,
            is_default: row.get::<_, i32>(5)? != 0,
            is_deletable: row.get::<_, i32>(6)? != 0,
            status: row.get(7)?, storage_path: row.get(8)?,
            created_at: row.get(9)?, updated_at: row.get(10)?,
            lib_count: row.get(11)?,
            video_count: row.get(12)?,
            total_size: row.get(13)?,
            total_duration: row.get(14)?,
        })
    }).map_err(AppError::Db)?.collect::<Result<Vec<_>, _>>().map_err(AppError::Db)?;
    Ok(cats)
}

pub fn insert(conn: &Connection, cat: &Category) -> AppResult<()> {
    conn.execute(
        "INSERT INTO categories (id,name,icon,note,sort_order,is_default,is_deletable,status,storage_path,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![cat.id, cat.name, cat.icon, cat.note, cat.sort_order,
                cat.is_default as i32, cat.is_deletable as i32, cat.status, cat.storage_path,
                cat.created_at, cat.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn update(conn: &Connection, id: &str, name: &str, icon: &str, note: &str, updated_at: &str) -> AppResult<()> {
    conn.execute("UPDATE categories SET name=?1, icon=?2, note=?3, updated_at=?4 WHERE id=?5",
        params![name, icon, note, updated_at, id]).map_err(AppError::Db)?;
    Ok(())
}

pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Category> {
    conn.query_row(
        "SELECT c.id,c.name,COALESCE(c.icon,''),COALESCE(c.note,''),c.sort_order,c.is_default,c.is_deletable,
                COALESCE(c.status,'normal'),COALESCE(c.storage_path,''),c.created_at,c.updated_at,
                COALESCE(lib_stats.lib_count,0),
                COALESCE(lib_stats.video_count,0),
                COALESCE(lib_stats.total_size,0),
                COALESCE(lib_stats.total_duration,0.0)
         FROM categories c
         LEFT JOIN (
             SELECT l.category_id,
                    COUNT(DISTINCT l.id) as lib_count,
                    COUNT(v.id) as video_count,
                    COALESCE(SUM(v.size),0) as total_size,
                    COALESCE(SUM(v.duration),0.0) as total_duration
             FROM libraries l
             LEFT JOIN videos v ON v.library_id = l.id
             GROUP BY l.category_id
         ) lib_stats ON lib_stats.category_id = c.id
         WHERE c.id=?1", params![id],
        |row| Ok(Category {
            id: row.get(0)?, name: row.get(1)?, icon: row.get(2)?, note: row.get(3)?,
            sort_order: row.get(4)?,
            is_default: row.get::<_, i32>(5)? != 0,
            is_deletable: row.get::<_, i32>(6)? != 0,
            status: row.get(7)?, storage_path: row.get(8)?,
            created_at: row.get(9)?, updated_at: row.get(10)?,
            lib_count: row.get(11)?,
            video_count: row.get(12)?,
            total_size: row.get(13)?,
            total_duration: row.get(14)?,
        }),
    ).map_err(AppError::Db)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<bool> {
    let n = conn.execute("DELETE FROM categories WHERE id=?1 AND is_deletable=1", params![id])
        .map_err(AppError::Db)?;
    Ok(n > 0)
}

pub fn is_deletable(conn: &Connection, id: &str) -> AppResult<bool> {
    conn.query_row("SELECT is_deletable FROM categories WHERE id=?1", params![id], |r| r.get::<_, i32>(0))
        .map(|v| v != 0).map_err(|_| AppError::NotFound { entity: "Category", id: id.to_string() })
}

pub fn update_status(conn: &Connection, id: &str, status: &str, updated_at: &str) -> AppResult<()> {
    conn.execute("UPDATE categories SET status=?1, updated_at=?2 WHERE id=?3",
        params![status, updated_at, id]).map_err(AppError::Db)?;
    Ok(())
}

pub fn update_sort(conn: &Connection, id: &str, sort_order: i32, updated_at: &str) -> AppResult<()> {
    conn.execute("UPDATE categories SET sort_order=?1, updated_at=?2 WHERE id=?3",
        params![sort_order, updated_at, id]).map_err(AppError::Db)?;
    Ok(())
}

pub fn get_library_ids(conn: &Connection, category_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT id FROM libraries WHERE category_id=?1").map_err(AppError::Db)?;
    let ids = stmt.query_map(params![category_id], |r| r.get::<_, String>(0))
        .map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    Ok(ids)
}
