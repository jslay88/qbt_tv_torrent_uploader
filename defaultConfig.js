const defaultConfig = {
    base_path: "/downloads/$title/Season $season",
    auto_delete: false,
    auto_delete_check_interval: 3,
    auto_delete_tag: "tv_torrent_uploader_autodelete",
    delete_after_ratio: 0,
    delete_after_time: 0,
    delete_requires_all_conditions: false,
    enable_auth: false,
    password: "adminadmin",
    server: "",
    username: "admin",
    match_pattern: "([\\w.\\s]+)(?:\\(?\\d{4}\\)?)?[.\\s]+(s\\d+e\\d+)",
    user_defined_pattern: false
}

export {
    defaultConfig
}