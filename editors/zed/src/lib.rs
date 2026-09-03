use std::{env, fs};

use zed_extension_api::{self as zed, settings::LspSettings, Result};

const LANGUAGE_SERVER_ID: &str = "flintmark";
const RELEASE_REPOSITORY: &str = "quboliu/flintmark";
const SERVER_FILE: &str = "flintmark-lsp.cjs";

struct FlintmarkExtension {
    cached_server_path: Option<String>,
}

impl FlintmarkExtension {
    fn configured_command(
        &self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Option<zed::Command> {
        let settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree).ok()?;
        let binary = settings.binary?;
        let path = binary.path.filter(|path| !path.trim().is_empty())?;

        Some(zed::Command {
            command: path,
            args: binary.arguments.unwrap_or_default(),
            env: binary.env.unwrap_or_default().into_iter().collect(),
        })
    }

    fn server_script_path(&mut self, language_server_id: &zed::LanguageServerId) -> Result<String> {
        if let Some(path) = &self.cached_server_path {
            if fs::metadata(path).is_ok_and(|metadata| metadata.is_file()) {
                return Ok(path.clone());
            }
        }

        let version = env!("CARGO_PKG_VERSION");
        let version_dir = format!("flintmark-lsp-{version}");
        let relative_path = format!("{version_dir}/{SERVER_FILE}");
        let absolute_path = env::current_dir()
            .map_err(|error| format!("failed to resolve the extension work directory: {error}"))?
            .join(&relative_path);

        if !absolute_path.is_file() {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::CheckingForUpdate,
            );

            let tag = format!("v{version}");
            let release = zed::github_release_by_tag_name(RELEASE_REPOSITORY, &tag).map_err(
                |error| {
                    format!(
                        "failed to find Flintmark release {tag}: {error}. For a development build, configure lsp.flintmark.binary to point at a locally built server"
                    )
                },
            )?;
            let asset_name = format!("flintmark-zed-lsp-{version}.zip");
            let asset = release
                .assets
                .iter()
                .find(|asset| asset.name == asset_name)
                .ok_or_else(|| {
                    format!(
                        "release {tag} does not contain the required Zed language-server asset {asset_name}"
                    )
                })?;

            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::download_file(
                &asset.download_url,
                &version_dir,
                zed::DownloadedFileType::Zip,
            )
            .map_err(|error| format!("failed to download {asset_name}: {error}"))?;

            if !absolute_path.is_file() {
                return Err(format!(
                    "{asset_name} did not contain the expected file {SERVER_FILE}"
                ));
            }

            Self::remove_stale_downloads(&version_dir);
        }

        let path = absolute_path.to_string_lossy().to_string();
        self.cached_server_path = Some(path.clone());
        Ok(path)
    }

    fn remove_stale_downloads(current_dir: &str) {
        let current = std::ffi::OsStr::new(current_dir);
        let Ok(entries) = fs::read_dir(".") else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name() else {
                continue;
            };
            if name == current || !name.to_string_lossy().starts_with("flintmark-lsp-") {
                continue;
            }
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            }
        }
    }

    fn downloaded_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
    ) -> Result<zed::Command> {
        let script = self.server_script_path(language_server_id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script, "--stdio".to_string()],
            env: Vec::new(),
        })
    }
}

impl zed::Extension for FlintmarkExtension {
    fn new() -> Self {
        Self {
            cached_server_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if language_server_id.as_ref() != LANGUAGE_SERVER_ID {
            return Err(format!(
                "unknown Flintmark language server: {language_server_id:?}"
            ));
        }

        if let Some(command) = self.configured_command(language_server_id, worktree) {
            return Ok(command);
        }

        if let Some(command) = worktree.which("flintmark-lsp") {
            return Ok(zed::Command {
                command,
                args: vec!["--stdio".to_string()],
                env: Vec::new(),
            });
        }

        self.downloaded_server_command(language_server_id)
    }
}

zed::register_extension!(FlintmarkExtension);
