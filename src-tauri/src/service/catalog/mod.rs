use rusqlite::Connection;
use crate::domain::category::Category;
use crate::domain::library::Library;
use crate::domain::video::Video;
use crate::domain::tag::TagName;
use crate::error::{AppError, AppResult};
use crate::repository::{categories, libraries, videos, tags as tags_repo};

pub fn get_categories(conn: &Connection) -> AppResult<Vec<Category>> {
    categories::get_all(conn)
}

pub fn create_category(conn: &Connection, name: String) -> AppResult<Category> {
    Category::validate_name(&name).map_err(|e| AppError::Validation { field: "name".into(), reason: e })?;
    let cat = Category::new(name);
    categories::insert(conn, &cat)?;
    Ok(cat)
}

pub fn delete_category(conn: &Connection, id: String, delete_libraries: bool) -> AppResult<()> {
    if !categories::is_deletable(conn, &id)? {
        return Err(AppError::Validation { field: "id".into(), reason: "系统默认分类无法删除".into() });
    }
    if delete_libraries {
        for lib_id in categories::get_library_ids(conn, &id)? {
            libraries::delete(conn, &lib_id)?;
        }
    }
    categories::delete(conn, &id)?;
    Ok(())
}

pub fn get_libraries(conn: &Connection, category_id: &str) -> AppResult<Vec<Library>> {
    libraries::get_by_category(conn, category_id)
}

pub fn create_library(conn: &Connection, category_id: String, name: String, icon: String) -> AppResult<Library> {
    Library::validate_name(&name).map_err(|e| AppError::Validation { field: "name".into(), reason: e })?;
    let lib = Library::new(category_id, name, icon);
    libraries::insert(conn, &lib)?;
    Ok(lib)
}

pub fn delete_library(conn: &Connection, id: &str) -> AppResult<()> {
    libraries::delete(conn, id)
}

pub fn get_video_detail(conn: &Connection, id: &str) -> AppResult<(Video, Vec<TagName>, Vec<String>)> {
    let video = videos::get_by_id(conn, id)?;
    let tag_data = tags_repo::get_video_tag_details(conn, id)?;
    let tags: Vec<TagName> = tag_data.iter().map(|(t, _)| t.clone()).collect();
    let values: Vec<String> = tag_data.into_iter().map(|(_, v)| v).collect();
    Ok((video, tags, values))
}
