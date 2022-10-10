import { defaultConfig } from "./defaultConfig.js";
let config = null

const inputServer = document.getElementById("inputServer")
const inputPath = document.getElementById("inputPath")
const inputMatchPattern = document.getElementById("inputMatchPattern")
const inputMatchTest = document.getElementById("inputMatchTest")
const inputEnableAuth = document.getElementById("inputEnableAuth")
const inputUsername = document.getElementById("inputUsername")
const inputPassword = document.getElementById("inputPassword")
const inputAutoDelete = document.getElementById("inputAutoDelete")
const inputTag = document.getElementById("inputTag")
const inputDeleteAfterTime = document.getElementById("inputDeleteAfterTime")
const inputDeleteAfterRatio = document.getElementById("inputDeleteAfterRatio")
const inputDeleteRequiresAll = document.getElementById("inputDeleteRequiresAll")
const inputAutoDeleteInterval = document.getElementById("inputAutoDeleteInterval")
const pathExample = document.getElementById("pathExample")
const btnResetMatchPattern = document.getElementById("btnResetMatchPattern")
const btnSave = document.getElementById("btnSave")
const linkHelp = document.getElementById("linkHelp")

inputEnableAuth.addEventListener("change", () => {
	inputUsername.disabled = !inputEnableAuth.checked
	inputPassword.disabled = !inputEnableAuth.checked
})

inputAutoDelete.addEventListener("change", () => {
	inputTag.disabled = !inputAutoDelete.checked
	inputDeleteAfterTime.disabled = !inputAutoDelete.checked
	inputDeleteAfterRatio.disabled = !inputAutoDelete.checked
	inputDeleteRequiresAll.disabled = !inputAutoDelete.checked
	inputAutoDeleteInterval.disabled = !inputAutoDelete.checked
})


function updateExample() {
	const matches = inputMatchTest.value
		.match(new RegExp(inputMatchPattern.value, "i"))
	if (!matches || matches.length < 3) {
		pathExample.innerText = "Match Failed!"
		return
	}
	const title = matches[1].split(".").join(" ").trim()
	const season = parseInt(matches[2].match(/s(\d+)/i)[1])
	const episode = parseInt(matches[2].match(/e(\d+)/i)[1])
	pathExample.innerText = inputPath.value
		.trim()
		.replace(/\/+$/, "")
		.replace(/\\+$/, "")
		.replace(/\$title/g, title)
		.replace(/\$season/g, season.toString())
		.replace(/\$episode/g, episode.toString())
}

inputPath.addEventListener("input", () => {
	updateExample()
})

inputMatchPattern.addEventListener("input", () => {
	updateExample()
})

inputMatchTest.addEventListener("input", () => {
	updateExample()
})

function loadConfig() {
	chrome.storage.local.get(["config"], (result) => {
		config = result.config
		inputServer.value = config.server
		inputPath.value = config.base_path
		inputMatchPattern.value = config.match_pattern
		inputEnableAuth.checked = config.enable_auth
		inputUsername.value = config.username
		inputPassword.value = config.password
		inputAutoDelete.checked = config.auto_delete
		inputTag.value = config.auto_delete_tag
		inputDeleteAfterTime.value = config.delete_after_time
		inputDeleteAfterRatio.value = config.delete_after_ratio
		inputDeleteRequiresAll.checked = config.delete_requires_all_conditions
		inputAutoDeleteInterval.value = config.auto_delete_check_interval

		inputUsername.disabled = !config.enable_auth
		inputPassword.disabled = !config.enable_auth

		inputTag.disabled = !config.auto_delete
		inputDeleteAfterTime.disabled = !config.auto_delete
		inputDeleteAfterRatio.disabled = !config.auto_delete
		inputDeleteRequiresAll.disabled = !config.auto_delete
		inputAutoDeleteInterval.disabled = !config.auto_delete

		updateExample(config)
	})
}

function saveConfig() {
	config = {
		server: inputServer.value.trim()
			.replace(/\/+$/, ""),
		base_path: inputPath.value.trim()
			.replace(/\/+$/, "")
			.replace(/\\+$/, ""),
		enable_auth: inputEnableAuth.checked,
		username: inputUsername.value.trim(),
		password: inputPassword.value.trim(),
		auto_delete: inputAutoDelete.checked,
		auto_delete_tag: inputTag.value.trim(),
		delete_after_time: Math.max(0, inputDeleteAfterTime.value),
		delete_after_ratio: Math.max(0, inputDeleteAfterRatio.value),
		delete_requires_all_conditions: inputDeleteRequiresAll.checked,
		auto_delete_check_interval: Math.max(1, inputAutoDeleteInterval.value),
		match_pattern: inputMatchPattern.value,
		user_defined_pattern: inputMatchPattern.value !== defaultConfig.match_pattern,
		previous_match_pattern: defaultConfig.match_pattern
	}
	chrome.storage.local.set({config: config}).then(() => {
		chrome.runtime.sendMessage({action: "reloadConfig"}).catch(() => {})
	})

}


loadConfig()
btnSave.addEventListener("click", saveConfig)
btnResetMatchPattern.addEventListener("click", () => {
	console.log(defaultConfig)
	inputMatchPattern.value = defaultConfig.match_pattern
	updateExample()
})
linkHelp.addEventListener("click", () => {
	chrome.tabs.create({ url: "https://github.com/jslay88/qbt_tv_torrent_uploader" }).catch(() => {})
})
