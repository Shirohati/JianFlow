use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, Window};

static LOCKED: AtomicBool = AtomicBool::new(false);
static YIELDED: AtomicBool = AtomicBool::new(false);
static HOOK_THREAD_ID: AtomicI32 = AtomicI32::new(0);
static KBD_HOOK: AtomicI32 = AtomicI32::new(0);
static WIN_HOOK: AtomicI32 = AtomicI32::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Serialize, Clone)]
pub struct ForegroundInfo {
    pub title: String,
    pub exe: String,
}

#[cfg(target_os = "windows")]
mod imp {
    use super::ForegroundInfo;
    use super::{APP_HANDLE, HOOK_THREAD_ID, KBD_HOOK, WIN_HOOK};
    use std::ffi::c_void;
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::Threading::{
        GetCurrentThreadId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, keybd_event, KEYEVENTF_KEYUP, VK_F4, VK_LWIN, VK_MENU, VK_RWIN, VK_TAB,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, CallNextHookEx, DispatchMessageW, EnumWindows, EVENT_SYSTEM_FOREGROUND,
        FindWindowW, GetForegroundWindow, GetMessageW, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible, KBDLLHOOKSTRUCT, MSG, PostThreadMessageW, SetForegroundWindow,
        SetWindowsHookExW, ShowWindow, SW_HIDE, SW_RESTORE, SW_SHOW, TranslateMessage, UnhookWindowsHookEx,
        WH_KEYBOARD_LL, WINEVENT_OUTOFCONTEXT, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN,
        WM_SYSKEYUP,
    };

    fn find_tray(class: &str) -> HWND {
        let wide: Vec<u16> = class.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe { FindWindowW(wide.as_ptr(), std::ptr::null()) }
    }

    pub fn hide_taskbar() {
        unsafe {
            ShowWindow(find_tray("Shell_TrayWnd"), SW_HIDE);
            ShowWindow(find_tray("Shell_SecondaryTrayWnd"), SW_HIDE);
        }
    }

    pub fn show_taskbar() {
        unsafe {
            ShowWindow(find_tray("Shell_TrayWnd"), SW_SHOW);
            ShowWindow(find_tray("Shell_SecondaryTrayWnd"), SW_SHOW);
        }
    }

    fn exe_of(hwnd: HWND) -> String {
        unsafe {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return String::new();
            }
            let hproc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if hproc.is_null() {
                return String::new();
            }
            let mut buf = [0u16; 512];
            let mut size = buf.len() as u32;
            #[link(name = "Kernel32")]
            extern "system" {
                fn QueryFullProcessImageNameW(
                    hprocess: *mut c_void,
                    dwflags: u32,
                    lpexename: *mut u16,
                    lpdwsize: *mut u32,
                ) -> i32;
            }
            let ok = QueryFullProcessImageNameW(hproc, 0, buf.as_mut_ptr(), &mut size);
            CloseHandle(hproc);
            if ok == 0 || size == 0 {
                return String::new();
            }
            let path = String::from_utf16_lossy(&buf[..size as usize]);
            path.rsplit('\\').next().unwrap_or("").to_string()
        }
    }

    fn title_of(hwnd: HWND) -> String {
        unsafe {
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if len <= 0 {
                return String::new();
            }
            String::from_utf16_lossy(&buf[..len as usize]).trim().to_string()
        }
    }

    unsafe extern "system" fn kbd_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && super::is_locked() && !super::is_yielded() {
            let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
            let vk = kb.vkCode;
            let is_press = wparam == WM_KEYDOWN as WPARAM
                || wparam == WM_SYSKEYDOWN as WPARAM
                || wparam == WM_KEYUP as WPARAM
                || wparam == WM_SYSKEYUP as WPARAM;
            if is_press {
                let alt = (GetAsyncKeyState(VK_MENU as i32) as i32 & 0x8000) != 0;
                // Block Alt+Tab (task switch), Win key (start menu), Alt+F4
                let snip = (vk == VK_TAB as u32 && alt)
                    || vk == VK_LWIN as u32
                    || vk == VK_RWIN as u32
                    || (vk == VK_F4 as u32 && alt);
                if snip {
                    return 1;
                }
            }
        }
        unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
    }

    unsafe extern "system" fn win_proc(
        _hook: *mut c_void,
        _event: u32,
        hwnd: HWND,
        _idobject: i32,
        _idchild: i32,
        _ideventthread: u32,
        _dwmseventtime: u32,
    ) {
        if hwnd.is_null() {
            return;
        }
        let info = ForegroundInfo {
            title: title_of(hwnd),
            exe: exe_of(hwnd),
        };
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("pomo://foreground", info);
        }
    }

    pub fn start_hooks() -> Result<(), String> {
        if HOOK_THREAD_ID.load(Ordering::SeqCst) != 0 {
            return Ok(());
        }
        std::thread::spawn(|| unsafe {
            let current = GetCurrentThreadId();
            HOOK_THREAD_ID.store(current as i32, Ordering::SeqCst);

            let kbd = SetWindowsHookExW(WH_KEYBOARD_LL, Some(kbd_proc), std::ptr::null_mut(), 0);
            KBD_HOOK.store(kbd as i32, Ordering::SeqCst);

            let ev = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(win_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            WIN_HOOK.store(ev as i32, Ordering::SeqCst);

            let mut msg: MSG = std::mem::zeroed();
            loop {
                let r = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
                if r == 0 || r == -1 {
                    break;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            if KBD_HOOK.load(Ordering::SeqCst) != 0 {
                UnhookWindowsHookEx(KBD_HOOK.load(Ordering::SeqCst) as *mut c_void);
                KBD_HOOK.store(0, Ordering::SeqCst);
            }
            if WIN_HOOK.load(Ordering::SeqCst) != 0 {
                UnhookWinEvent(WIN_HOOK.load(Ordering::SeqCst) as *mut c_void);
                WIN_HOOK.store(0, Ordering::SeqCst);
            }
            HOOK_THREAD_ID.store(0, Ordering::SeqCst);
        });
        Ok(())
    }

    pub fn stop_hooks() {
        if HOOK_THREAD_ID.load(Ordering::SeqCst) != 0 {
            unsafe {
                if KBD_HOOK.load(Ordering::SeqCst) != 0 {
                    UnhookWindowsHookEx(KBD_HOOK.load(Ordering::SeqCst) as *mut c_void);
                    KBD_HOOK.store(0, Ordering::SeqCst);
                }
                if WIN_HOOK.load(Ordering::SeqCst) != 0 {
                    UnhookWinEvent(WIN_HOOK.load(Ordering::SeqCst) as *mut c_void);
                    WIN_HOOK.store(0, Ordering::SeqCst);
                }
                PostThreadMessageW(HOOK_THREAD_ID.load(Ordering::SeqCst) as u32, WM_QUIT, 0, 0);
            }
        }
    }

    pub fn foreground_info() -> ForegroundInfo {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return ForegroundInfo { title: String::new(), exe: String::new() };
            }
            ForegroundInfo {
                title: title_of(hwnd),
                exe: exe_of(hwnd),
            }
        }
    }

    struct EnumCtx {
        target: String,
        found: HWND,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> i32 {
        let ctx = &mut *(lparam as *mut EnumCtx);
        if !ctx.found.is_null() {
            return 0;
        }
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let title = title_of(hwnd);
        if title.is_empty() {
            return 1;
        }
        let exe = exe_of(hwnd).to_lowercase();
        if exe == ctx.target || exe == format!("{}.exe", ctx.target) {
            ctx.found = hwnd;
            return 0;
        }
        1
    }

    /// 根据进程名找到可见主窗口并激活到前台
    pub fn activate_app(exe: &str) -> bool {
        let target = exe.trim().trim_end_matches(".exe").to_lowercase();
        let mut ctx = EnumCtx { target: target.clone(), found: std::ptr::null_mut() };
        unsafe {
            EnumWindows(Some(enum_proc), &mut ctx as *mut EnumCtx as LPARAM);
            if ctx.found.is_null() {
                return false;
            }
            ShowWindow(ctx.found, SW_RESTORE);
            SetForegroundWindow(ctx.found);
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
            SetForegroundWindow(ctx.found);
            BringWindowToTop(ctx.found);
        }
        true
    }

    /// 根据窗口标题关键词找到可见主窗口并激活到前台
    pub fn activate_title(keyword: &str) -> bool {
        let kw = keyword.trim().to_lowercase();
        let mut ctx = EnumCtx { target: kw, found: std::ptr::null_mut() };
        unsafe {
            EnumWindows(Some(enum_proc_title), &mut ctx as *mut EnumCtx as LPARAM);
            if ctx.found.is_null() {
                return false;
            }
            ShowWindow(ctx.found, SW_RESTORE);
            SetForegroundWindow(ctx.found);
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
            SetForegroundWindow(ctx.found);
            BringWindowToTop(ctx.found);
        }
        true
    }

    unsafe extern "system" fn enum_proc_title(hwnd: HWND, lparam: LPARAM) -> i32 {
        let ctx = &mut *(lparam as *mut EnumCtx);
        if !ctx.found.is_null() {
            return 0;
        }
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let title = title_of(hwnd).to_lowercase();
        if title.is_empty() {
            return 1;
        }
        if title.contains(&ctx.target) {
            ctx.found = hwnd;
            return 0;
        }
        1
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::ForegroundInfo;
    pub fn hide_taskbar() {}
    pub fn show_taskbar() {}
    pub fn start_hooks() -> Result<(), String> { Ok(()) }
    pub fn stop_hooks() {}
    pub fn foreground_info() -> ForegroundInfo {
        ForegroundInfo { title: String::new(), exe: String::new() }
    }
    pub fn activate_app(_exe: &str) -> bool { false }
    pub fn activate_title(_keyword: &str) -> bool { false }
}

#[tauri::command]
pub fn lock_enter(window: Window) -> Result<(), String> {
    let _ = APP_HANDLE.set(window.app_handle().clone());
    window
        .set_fullscreen(true)
        .map_err(|e| format!("全屏失败: {}", e))?;
    window
        .set_always_on_top(true)
        .map_err(|e| format!("置顶失败: {}", e))?;
    let _ = window.set_focus();
    LOCKED.store(true, Ordering::SeqCst);
    imp::hide_taskbar();
    imp::start_hooks()?;
    Ok(())
}

#[tauri::command]
pub fn lock_exit(window: Window) -> Result<(), String> {
    YIELDED.store(false, Ordering::SeqCst);
    LOCKED.store(false, Ordering::SeqCst);
    imp::stop_hooks();
    imp::show_taskbar();
    let _ = window.show();
    window
        .set_always_on_top(false)
        .map_err(|e| format!("取消置顶失败: {}", e))?;
    window
        .set_fullscreen(false)
        .map_err(|e| format!("退出全屏失败: {}", e))?;
    Ok(())
}

/// 让位：前台为白名单应用时隐藏锁屏窗口，放行快捷键
#[tauri::command]
pub fn lock_yield(window: Window) -> Result<(), String> {
    if !LOCKED.load(Ordering::SeqCst) {
        return Ok(());
    }
    YIELDED.store(true, Ordering::SeqCst);
    let _ = window.hide();
    Ok(())
}

/// 恢复锁定：白名单之外的前台出现时，重新显示锁屏并恢复拦截
#[tauri::command]
pub fn lock_resume(window: Window) -> Result<(), String> {
    if !LOCKED.load(Ordering::SeqCst) {
        return Ok(());
    }
    YIELDED.store(false, Ordering::SeqCst);
    window
        .set_fullscreen(true)
        .map_err(|e| format!("全屏失败: {}", e))?;
    window
        .set_always_on_top(true)
        .map_err(|e| format!("置顶失败: {}", e))?;
    let _ = window.show();
    let _ = window.set_focus();
    imp::hide_taskbar();
    Ok(())
}

pub fn restore_on_exit() {
    YIELDED.store(false, Ordering::SeqCst);
    if LOCKED.swap(false, Ordering::SeqCst) {
        imp::stop_hooks();
        imp::show_taskbar();
    }
}

#[tauri::command]
pub fn lock_foreground_info() -> Result<ForegroundInfo, String> {
    Ok(imp::foreground_info())
}

/// 将白名单中的程序（exe 名）窗口激活到前台；找不到则返回 false
#[tauri::command]
pub fn lock_activate_app(exe: String) -> Result<bool, String> {
    Ok(imp::activate_app(&exe))
}

/// 将窗口标题包含关键词的窗口激活到前台；找不到则返回 false
#[tauri::command]
pub fn lock_activate_title(keyword: String) -> Result<bool, String> {
    Ok(imp::activate_title(&keyword))
}

pub fn is_locked() -> bool {
    LOCKED.load(Ordering::SeqCst)
}

pub fn is_yielded() -> bool {
    YIELDED.load(Ordering::SeqCst)
}