fn main() {
    let is_sandbox = std::env::var("TRAESANDBOX").is_ok()
        || std::env::var("TRAE_SANDBOX").is_ok()
        || std::env::var("SANDBOX").is_ok();

    if is_sandbox {
        // Fallback: manually set the essential environment variables
        println!("cargo:rustc-check-cfg=cfg(desktop)");
        println!("cargo:rustc-cfg=desktop");
        println!("cargo:rustc-check-cfg=cfg(mobile)");
        println!("cargo:rustc-cfg=dev");
        println!("cargo:rustc-env=TAURI_ENV_TARGET_TRIPLE=x86_64-pc-windows-msvc");
        println!("cargo:rustc-env=TAURI_ANDROID_PACKAGE_NAME_PREFIX=com_learning_todo_desktop");
        println!("cargo:rerun-if-changed=tauri.conf.json");
        println!("cargo:rerun-if-changed=capabilities");

        // Generate Windows manifest for ComCtl32 v6 (required by TaskDialogIndirect)
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let manifest = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
    </windowsSettings>
  </application>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
    </application>
  </compatibility>
</assembly>"#;
        let manifest_path = format!("{}/learning_todo.manifest", out_dir);
        std::fs::write(&manifest_path, manifest).unwrap();
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest_path);
    } else {
        tauri_build::build();
    }
}
