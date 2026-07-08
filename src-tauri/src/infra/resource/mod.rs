use std::sync::{Arc, Condvar, Mutex};

pub struct ResourceManager {
    inner: Arc<(Mutex<u32>, Condvar)>,
}

impl ResourceManager {
    pub fn new(max: u32) -> Self {
        ResourceManager {
            inner: Arc::new((Mutex::new(max), Condvar::new())),
        }
    }

    pub fn acquire(&self) -> ResourceGuard {
        let (lock, cvar) = &*self.inner;
        let mut available = lock.lock().unwrap();
        while *available == 0 {
            available = cvar.wait(available).unwrap();
        }
        *available -= 1;
        ResourceGuard { inner: self.inner.clone() }
    }
}

pub struct ResourceGuard {
    inner: Arc<(Mutex<u32>, Condvar)>,
}

impl Drop for ResourceGuard {
    fn drop(&mut self) {
        let (lock, cvar) = &*self.inner;
        let mut available = lock.lock().unwrap();
        *available += 1;
        cvar.notify_one();
    }
}

pub struct AppResourceManager {
    pub scan: ResourceManager,
    pub encode: ResourceManager,
}

impl AppResourceManager {
    pub fn new(scan_max: u32, encode_max: u32) -> Self {
        AppResourceManager {
            scan: ResourceManager::new(scan_max),
            encode: ResourceManager::new(encode_max),
        }
    }
}
