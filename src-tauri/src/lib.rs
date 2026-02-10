use serde::Serialize;
use sysinfo::System;
use tauri::{AppHandle, Manager, State};
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use std::sync::atomic::AtomicU32;

#[derive(Serialize, Clone)]
struct HardwareStats {
    cpu_usage: f32,
    ram_usage: f64,
    gpu_usage: Option<f32>,
    npu_usage: Option<f32>,
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use std::process::Child;
use std::os::windows::process::CommandExt;

pub struct AppState {
    pub system: Mutex<System>,
    pub serve_should_be_running: AtomicBool,
    pub current_model: Mutex<Option<String>>,
    pub serve_process: Mutex<Option<Child>>,
    pub pull_pid: AtomicU32,
    pub pull_cancelled: Arc<AtomicBool>,
}


#[derive(Serialize, Clone)]
struct CommandOutput {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
}

#[derive(Serialize, Clone)]
struct LocalModel {
    name: String,
    size: String,
    modality: String,
}

#[tauri::command]
async fn run_nexa_command(_app: AppHandle, args: Vec<String>) -> Result<CommandOutput, String> {
    use std::process::Command;
    let nexa_path = r"C:\Users\sergi\AppData\Local\Nexa CLI\nexa.exe";
    let output = Command::new(nexa_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute nexa (direct path): {}", e))?;
    
    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

#[tauri::command]
async fn get_local_models(_app: AppHandle) -> Result<Vec<LocalModel>, String> {
    use std::process::Command;
    let nexa_path = r"C:\Users\sergi\AppData\Local\Nexa CLI\nexa.exe";
    let output = Command::new(nexa_path)
        .arg("list")
        .output()
        .map_err(|e| format!("Execution error (nexa list): {}", e))?;
        
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if !output.status.success() {
        return Err(format!("Nexa exited with {}: {}", output.status, stderr));
    }

    // Diagnostic logging
    println!("--- nexa list stdout ---\n{}\n---", stdout);
    
    let mut models = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        // Skip box drawing borders and headers
        if line.is_empty() 
           || line.contains('─') 
           || line.contains('┌') 
           || line.contains('┬') 
           || line.contains('┐')
           || line.contains('├')
           || line.contains('┼')
           || line.contains('┤')
           || line.contains('└')
           || line.contains('┴')
           || line.contains('┘')
           || line.to_uppercase().contains("NAME") {
            continue;
        }
        
        // Parse lines containing │
        if line.contains('│') {
            let parts: Vec<&str> = line.split('│')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if !parts.is_empty() {
                models.push(LocalModel {
                    name: parts[0].to_string(),
                    size: parts.get(1).unwrap_or(&"").to_string(),
                    modality: parts.get(2).unwrap_or(&"").to_string(), 
                });
            }
        }
    }
    
    Ok(models)
}

use wmi::{COMLibrary, WMIConnection, Variant};
use std::collections::HashMap;

fn get_wmi_performance_stats() -> (Option<f32>, Option<f32>) {
    let mut gpu_usage: f32 = 0.0;
    let mut npu_usage_sum: f32 = 0.0;
    let mut has_npu = false;

    let com_lib = match COMLibrary::new() {
        Ok(lib) => lib,
        Err(_) => return (None, None),
    };

    let wmi_con = match WMIConnection::new(com_lib) {
        Ok(con) => con,
        Err(_) => return (None, None),
    };

    // Query Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
    // The property is 'UtilizationPercentage' in this specific class
    let results: Vec<HashMap<String, Variant>> = match wmi_con.raw_query("SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine") {
        Ok(res) => res,
        Err(_) => return (None, None),
    };

    for row in results {
        let usage_f = match row.get("UtilizationPercentage") {
            Some(Variant::UI8(usage)) => *usage as f32,
            Some(Variant::I8(usage)) => *usage as f32,
            Some(Variant::UI4(usage)) => *usage as f32,
            Some(Variant::I4(usage)) => *usage as f32,
            _ => 0.0,
        };

        if let Some(Variant::String(name)) = row.get("Name") {
            let name_up = name.to_uppercase();
            
            // GPU: Standard 3D engines
            if name_up.contains("ENGTYPE_3D") {
                gpu_usage += usage_f;
            }
            
            // NPU: Compute engines on Snapdragon X Elite
            if name_up.contains("ENGTYPE_COMPUTE") || name_up.contains("NPU") {
                has_npu = true;
                npu_usage_sum += usage_f;
            }
        }
    }

    (
        Some(gpu_usage.min(100.0)),
        if has_npu { Some(npu_usage_sum.min(100.0)) } else { None }
    )
}

#[tauri::command]
async fn get_hardware_stats(_app: AppHandle, state: State<'_, AppState>) -> Result<HardwareStats, String> {
    let (cpu_usage, ram_usage) = {
        let mut sys = state.system.lock().unwrap();
        sys.refresh_all();
        (
            sys.global_cpu_info().cpu_usage(),
            (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0
        )
    };

    let mut gpu_usage = None;
    let mut npu_usage = None;

    // 1. Try xrt-smi for NPU (Xilinx/Nexa standard)
    if let Ok(output) = std::process::Command::new("xrt-smi")
        .args(["examine", "--report", "platform", "-f", "JSON"])
        .output() {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                if let Some(usage) = json.get("npu_usage").and_then(|v| v.as_f64()) {
                    npu_usage = Some(usage as f32);
                }
            }
        }

    // 2. Try nvidia-smi for GPU (NVIDIA standard)
    if gpu_usage.is_none() {
        if let Ok(output) = std::process::Command::new("nvidia-smi")
            .args(["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"])
            .output() {
                let s = String::from_utf8_lossy(&output.stdout);
                if let Ok(usage) = s.trim().parse::<f32>() {
                    gpu_usage = Some(usage);
                }
            }
    }

    // 3. WMI Fallback for Windows (Adreno/Snapdragon)
    if gpu_usage.is_none() || npu_usage.is_none() {
        let (wmi_gpu, wmi_npu) = get_wmi_performance_stats();
        if gpu_usage.is_none() { gpu_usage = wmi_gpu; }
        if npu_usage.is_none() { npu_usage = wmi_npu; }
    }

    Ok(HardwareStats {
        cpu_usage,
        ram_usage,
        gpu_usage,
        npu_usage,
    })
}

#[tauri::command]
async fn start_nexa_serve(_app: AppHandle, state: State<'_, AppState>, model: String) -> Result<(), String> {
    use std::process::Command;
    let nexa_path = r"C:\Users\sergi\AppData\Local\Nexa CLI\nexa.exe";
    
    // Check if something is already listening on 18181
    let addr: SocketAddr = "127.0.0.1:18181".parse().unwrap();
    if std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok() {
        // Port taken - just assume it's nexa and update state
        *state.current_model.lock().unwrap() = Some(model);
        state.serve_should_be_running.store(true, Ordering::SeqCst);
        return Ok(());
    }

    let mut process_guard = state.serve_process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
    }

    let child = Command::new(nexa_path)
        .args(["serve", &model])
        .spawn()
        .map_err(|e| format!("Failed to spawn nexa serve: {}", e))?;
    
    *process_guard = Some(child);
    *state.current_model.lock().unwrap() = Some(model);
    state.serve_should_be_running.store(true, Ordering::SeqCst);
    
    Ok(())
}

fn extract_progress(line: &str) -> Option<f32> {
    // Strip ANSI escape sequences from the line before parsing
    if let Some(percent_idx) = line.find('%') {
        let _before = &line[..percent_idx];
        // We want to find the number at the end of 'before', ignoring ANSI junk.
        // Let's filter 'before' to only keep valid progress characters?
        // No, that might merge numbers. "Speed 10 45%".

        // Let's walk backwards. If we hit '\x1b' or '[' or 'm' or ';', we skip them?
        // That's dangerous (m might be in text).
        
        // Strategy: Strip ANSI from the whole line first.
        let mut stripped = String::new();
        let mut in_escape = false;
        let mut chars = line.chars().peekable();
        
        while let Some(c) = chars.next() {
            if c == '\x1b' {
                in_escape = true;
                if let Some(&'[') = chars.peek() {
                    chars.next(); // consume '['
                }
            } else if in_escape {
                if c.is_ascii_alphabetic() {
                    in_escape = false;
                }
            } else {
                stripped.push(c);
            }
        }
        
        // Now parse stripped
        if let Some(percent_idx) = stripped.find('%') {
            let before = &stripped[..percent_idx];
            let mut end = before.len();
            
            while end > 0 && before.as_bytes()[end-1].is_ascii_whitespace() {
                 end -= 1;
            }
            let mut start = end;
            while start > 0 {
                let c = before.as_bytes()[start-1];
                if c.is_ascii_digit() || c == b'.' {
                    start -= 1;
                } else {
                    break;
                }
            }
            
            if start < end {
                return before[start..end].parse::<f32>().ok();
            }
        }
    }
    None
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    model: String,
    status: String,
    progress: Option<f32>,
    message: String,
}

#[tauri::command]
async fn nexa_pull_model(app: AppHandle, state: State<'_, AppState>, model: String, model_type: Option<String>) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::io::{BufReader, Read};
    use tauri::Emitter;
    use std::sync::{Arc, Mutex as StdMutex};
    
    println!("[PULL] Called with model={:?}, model_type={:?}", model, model_type);

    let nexa_path = r"C:\Users\sergi\AppData\Local\Nexa CLI\nexa.exe";
    
    let mut args = vec!["pull", model.as_str()];
    if let Some(ref mtype) = model_type {
        args.push("--model-type");
        args.push(mtype.as_str());
    }
    
    println!("[COMMAND] Executing: {} {:?}", nexa_path, args);
    
    let mut child = Command::new(nexa_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000) 
        .spawn()
        .map_err(|e| format!("Failed to spawn nexa pull: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
    
    // Wrap child in Arc<Mutex> so threads can access it
    let child_handle = Arc::new(StdMutex::new(Some(child)));
    
    // Store PID in app state for cancel_pull
    if let Ok(child_guard) = child_handle.lock() {
        if let Some(ref child) = *child_guard {
            state.pull_pid.store(child.id(), Ordering::SeqCst);
        }
    }

    let app_handle = app.clone();
    let model_clone = model.clone();

    // Stdout reader
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        let mut byte_buf = [0u8; 1];

        while let Ok(n) = reader.read(&mut byte_buf) {
            if n == 0 { break; }
            let b = byte_buf[0];

            if b == b'\n' || b == b'\r' {
                if !buffer.is_empty() {
                    let raw_line = String::from_utf8_lossy(&buffer).to_string();
                    let clean_line = raw_line.trim().to_string();
                    
                    if !clean_line.is_empty() {
                         println!("[STDOUT] Raw: {:?}", clean_line);
                         let progress = extract_progress(&clean_line);
                         println!("[STDOUT] Extracted progress: {:?}", progress);
                         let _ = app_handle.emit("download-progress", DownloadProgress {
                            model: model_clone.clone(),
                            status: "pulling".into(),
                            progress,
                            message: clean_line,
                        });
                    }
                    buffer.clear();
                }
            } else {
                buffer.push(b);
            }
        }
    });

    let app_handle_err = app.clone();
    let model_clone_err = model.clone();
    
    // Shared state for collecting model types across threads
    let collected_types = Arc::new(StdMutex::new(Vec::<String>::new()));
    let collected_types_timer = collected_types.clone();
    let app_handle_timer = app.clone();
    let model_clone_timer = model.clone();
    let child_handle_timer = child_handle.clone();
    
    // Flag to indicate process was killed for type detection (not an error)
    let killed_for_types = Arc::new(AtomicBool::new(false));
    let killed_for_types_timer = killed_for_types.clone();
    let killed_for_types_exit = killed_for_types.clone();

    // Stderr reader - also detects interactive prompts
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buffer = Vec::new();
        let mut byte_buf = [0u8; 1];
        let mut in_type_selection = false;
        let mut timer_started = false;

        while let Ok(n) = reader.read(&mut byte_buf) {
            if n == 0 { break; }
            let b = byte_buf[0];

            if b == b'\n' || b == b'\r' {
                if !buffer.is_empty() {
                    let raw_line = String::from_utf8_lossy(&buffer).to_string();
                    let clean_line = raw_line.trim().to_string();
                    
                    if !clean_line.is_empty() {
                         println!("[STDERR] Raw: {:?}", clean_line);
                         
                         // Detect "Choose Model Type" prompt
                         if clean_line.contains("Choose Model Type") {
                             in_type_selection = true;
                         } else if in_type_selection {
                             // Extract model type from lines like "┃ > llm" or "┃   vlm"
                             if let Some(type_str) = clean_line.strip_prefix("┃") {
                                 let type_str = type_str.trim().trim_start_matches('>').trim();
                                 if !type_str.is_empty() && !type_str.contains("Choose") {
                                     if let Ok(mut types) = collected_types.lock() {
                                         types.push(type_str.to_string());
                                     }
                                     
                                     // Start a 2-second timer on first type seen
                                     if !timer_started {
                                         timer_started = true;
                                         let types_ref = collected_types_timer.clone();
                                         let app_ref = app_handle_timer.clone();
                                         let model_ref = model_clone_timer.clone();
                                         let child_ref = child_handle_timer.clone();
                                         let killed_for_types_clone = killed_for_types_timer.clone();
                                         
                                         std::thread::spawn(move || {
                                             std::thread::sleep(std::time::Duration::from_secs(2));
                                             
                                             let types = types_ref.lock().unwrap().clone();
                                             if !types.is_empty() {
                                                 println!("[TIMER] Emitting model types: {:?}", types);
                                                 let _ = app_ref.emit("model-type-required", serde_json::json!({
                                                     "model": model_ref,
                                                     "types": types
                                                 }));
                                                 
                                                 // Kill the process
                                                 killed_for_types_clone.store(true, Ordering::SeqCst);
                                                 if let Ok(mut child_opt) = child_ref.lock() {
                                                     if let Some(mut child) = child_opt.take() {
                                                         let _ = child.kill();
                                                     }
                                                 }
                                             }
                                         });
                                     }
                                 }
                             }
                         }
                         
                         if !in_type_selection {
                             let progress = extract_progress(&clean_line);
                             println!("[STDERR] Extracted progress: {:?}", progress);
                             let _ = app_handle_err.emit("download-progress", DownloadProgress {
                                model: model_clone_err.clone(),
                                status: "pulling".into(),
                                progress,
                                message: clean_line,
                            });
                         }
                    }
                    buffer.clear();
                }
            } else {
                buffer.push(b);
            }
        }
    });

    let app_handle_exit = app.clone();
    let model_clone_exit = model.clone();
    let child_handle_exit = child_handle.clone();
    let pull_cancelled_exit = state.pull_cancelled.clone();
    
    // Reset cancelled flag for this new download
    state.pull_cancelled.store(false, Ordering::SeqCst);
    
    tauri::async_runtime::spawn_blocking(move || {
        // Take the child from the Arc<Mutex> and wait for it
        let status = {
            let mut child_opt = child_handle_exit.lock().unwrap();
            if let Some(mut child) = child_opt.take() {
                child.wait()
            } else {
                // Process was already killed (e.g., by type detection)
                return;
            }
        };
        
        // Check if process was killed for type detection or cancelled by user
        let was_intentional = killed_for_types_exit.load(Ordering::SeqCst) 
            || pull_cancelled_exit.load(Ordering::SeqCst);
        
        match status {
            Ok(s) if s.success() => {
                 let _ = app_handle_exit.emit("download-progress", DownloadProgress {
                    model: model_clone_exit,
                    status: "success".into(),
                    progress: Some(100.0),
                    message: "Download completed successfully".into(),
                });
            }
            Ok(s) => {
                 if !was_intentional {
                     let _ = app_handle_exit.emit("download-progress", DownloadProgress {
                        model: model_clone_exit.clone(),
                        status: "error".into(),
                        progress: None,
                        message: format!("Process exited with status: {}", s),
                    });
                 }
            }
             Err(e) => {
                 if !was_intentional {
                     let _ = app_handle_exit.emit("download-progress", DownloadProgress {
                        model: model_clone_exit,
                        status: "error".into(),
                        progress: None,
                        message: format!("Process wait error: {}", e),
                    });
                 }
             }
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn check_server_health() -> bool {
    let addr: SocketAddr = "127.0.0.1:18181".parse().unwrap();
    std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok()
}

#[tauri::command]
fn cancel_pull(app: AppHandle, state: State<'_, AppState>) {
    use tauri::Emitter;
    let pid = state.pull_pid.load(Ordering::SeqCst);
    if pid != 0 {
        println!("[PULL] Cancelling download, killing PID {}", pid);
        // Set cancelled flag BEFORE killing so the exit handler knows
        state.pull_cancelled.store(true, Ordering::SeqCst);
        state.pull_pid.store(0, Ordering::SeqCst);
        // Use taskkill to forcefully terminate the process tree
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x08000000)
            .output();
        let _ = app.emit("download-progress", DownloadProgress {
            model: String::new(),
            status: "cancelled".into(),
            progress: None,
            message: "Download cancelled".into(),
        });
    }
}

#[tauri::command]
fn stop_nexa_serve(state: State<'_, AppState>) {
    let mut process_guard = state.serve_process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
    }
    *state.current_model.lock().unwrap() = None;
    state.serve_should_be_running.store(false, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            system: Mutex::new(System::new_all()),
            serve_should_be_running: AtomicBool::new(false),
            current_model: Mutex::new(None),
            serve_process: Mutex::new(None),
            pull_pid: AtomicU32::new(0),
            pull_cancelled: Arc::new(AtomicBool::new(false)),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if let Some(state) = handle.try_state::<AppState>() {
                        if state.serve_should_be_running.load(Ordering::SeqCst) {
                            let addr: SocketAddr = "127.0.0.1:18181".parse().unwrap();
                            if std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_err() {
                                println!("Nexa serve unresponsive, attempting restart...");
                                let model_opt = state.current_model.lock().unwrap().clone();
                                if let Some(model) = model_opt {
                                    // Trigger restart
                                    use std::process::Command;
                                    let nexa_path = r"C:\Users\sergi\AppData\Local\Nexa CLI\nexa.exe";
                                    if let Ok(child) = Command::new(nexa_path).args(["serve", &model]).spawn() {
                                        let mut pg = state.serve_process.lock().unwrap();
                                        *pg = Some(child);
                                        println!("Server restarted for model: {}", model);
                                    }
                                }
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_hardware_stats,
            run_nexa_command,
            get_local_models,
            start_nexa_serve,
            stop_nexa_serve,
            nexa_pull_model,
            cancel_pull,
            check_server_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
