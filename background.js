/*
This extension is made to parse magnet links for single TV Episode Torrents.
It will auto parse the show title, season number, and episode number.
User can define the path for which to save the torrent using `$title`, `$season`, `$episode`.
*/
import { defaultConfig } from "./defaultConfig.js";
let config = {}

function getConfig(callback = null) {
	chrome.storage.local.get(['config'], (result) => {
		config = result.config
		if (callback) {
			callback(config)
		}
	})
}

function setConfig(new_config, callback = null) {
	console.debug("Set Config")
	console.debug(new_config)
	config = new_config
	config.user_defined_pattern = config.match_pattern !== defaultConfig.match_pattern
	config.previous_match_pattern = defaultConfig.match_pattern
	chrome.storage.local.set({config: new_config}, callback)
}

function sendNotification(id = null, title, message, callback = null) {
	chrome.notifications.create(
		id,
		{
			title: title,
			message: message,
			iconUrl: "img/icon_48.png",
			priority: 2,
			type: "basic"
		},
		callback)
}

async function parseLink(link) {
	if (!config.server) {
		console.error(`There is no server set in the config. ${config.server}`)
		sendNotification(null, "Config Missing!", "Server config not set!")
		return
	}
	// Parse out magnet query params
	const params = new URLSearchParams(link)
	if (!params.has("dn") || !params.has("magnet:?xt")) {
		console.error(`Invaid Magnet link. Missing \`dn\` key! Aborting! ${link}`)
		sendNotification(
			null,
			"Torrent add failed!",
			`Unable to parse display name from magnet link! ${link}`
		)
		return
	}
	// const hash = params.get("magnet:?xt").match(/[a-f\d]{40}/i)[0].toLowerCase()
	const name = params.get("dn")

	// Regex match title, season, and episode
	console.debug(`Processing Torrent ${name}`)
	const matches = name.match(new RegExp(config.match_pattern, "i"))
	if (!matches) {
		console.debug(name)
		console.debug(matches)
		console.error("Match Failure. Aborting!")
		sendNotification(
			null,
			"Torrent add failed!",
			`Unable to match title and Season/Episode pattern! ${name}`
		)
		return
	}

	// Pop title
	const title = matches[1].split(".").join(" ").trim()
	console.debug(`Discovered Title: ${title}`)

	// Regex match the Season number
	const season = parseInt(matches[2].match(/s(\d+)/i)[1])
	const episode = parseInt(matches[2].match(/e(\d+)/i)[1])
	console.debug(`Discovered Season: ${season}`)
	console.debug(`Discovered Episode: ${episode}`)

	// Ensure we have a valid session
	if (!await qbtLogin()) {
		return
	}  

	// Build up form data (urls, savepath, tag)
	const path = config.base_path
		.replace(/\$title/g, title)
		.replace(/\$season/g, season.toString())
		.replace(/\$episode/g, episode.toString())
	const torrentForm = new FormData()
	torrentForm.append("urls", link)
	torrentForm.append("savepath", path)
	if (config.auto_delete) {
		torrentForm.append("tags", config.auto_delete_tag)
	}

	// Add Torrent
	const resp = await fetch(`${config.server}/api/v2/torrents/add`, {
		method: "POST",
		body: torrentForm,
		mode: "no-cors"
	})
	console.debug(`Add Torrent Response OK: ${resp.ok}`)
	if (!resp.ok) {
		sendNotification(
			null,
			"Torrent add failed!",
			`Failed to upload ${title} ${matches[2]}`
		)
	} else {
		sendNotification(
			null,
			"Torrent added!",
			`${title} ${matches[2]} -> ${path}`
		)
	}
}


function setupContextMenus() {
	// Add context menu
	chrome.contextMenus.create({
		id: "net.jslay.torrent-upload",
		title: "Torrent TV Episode",
		type: "normal",
		contexts: ["link"]
	})
}

chrome.runtime.onInstalled.addListener(async (details) => {
	setupContextMenus()
	getConfig((config) => {
		if (config === null) {
			setConfig(defaultConfig)
		} else {
			if (details.reason !== "update") {
				return
			}
			try {
				if (
					config.user_defined_pattern &&
					config.previous_match_pattern !== defaultConfig.match_pattern
				) {
					sendNotification(
						null,
						"Default Match Pattern Update",
						"The default match pattern was updated. " +
						"Your defined match pattern has not been changed. " +
						"You may want to check Help for changes."
					)
				} else if (
					!config.user_defined_pattern
				) {
					config.match_pattern = defaultConfig.match_pattern
				}
				// Add new keys from defaultConfig to config
				for (const [key, value] of Object.entries(defaultConfig)) {
					if (!(key in config)) {
						config[key] = value
					}
				}
			} catch(err) {
				sendNotification(
					null,
					"UPGRADE FAILED",
					"Something went wrong updating the extension. Config has been reset. " +
					`Please report this error: ${err}`
				)
				config = defaultConfig
			} finally {
				setConfig(config)
			}
		}
	})
})


async function qbtLogin() {
	if (!config.server) {
		return false
	}
	if (!config.enable_auth || !config.username || !config.password) {
		return true
	}
	const loginForm = new FormData()
	loginForm.append("username", config.username)
	loginForm.append("password", config.password)
	const resp = await fetch(`${config.server}/api/v2/auth/login`, {
		method: "POST",
		body: loginForm,
		mode: "no-cors"
	})
	console.debug(`Login Response OK: ${resp.ok}`)
	if (!resp.ok) {
		sendNotification(
			null,
			"qBt Login Failed!",
			"Auth is enabled, but unable to login with provided credentials!"
		)
	}
	return resp.ok
}

function createAlarm() {
	chrome.alarms.get("torrent_delete", (alarm) => {
		if (alarm && alarm.periodInMinutes === config.auto_delete_check_interval) {
			return
		}
		chrome.alarms.create("torrent_delete", {
			periodInMinutes: config.auto_delete_check_interval
		})
	})
}


async function clearFinishedTorrents() {
	// Ensure we have a valid session
	if (!config.server || !await qbtLogin()) {
		return
	}

	// Query Seeding Torrents with matching tag
	let resp = await fetch(`${config.server}/api/v2/torrents/info?` + new URLSearchParams({
		filter: "seeding,completed",
		tag: config.auto_delete_tag,
	}),
	{
		method: "GET",
		mode: "no-cors"
	})
	console.debug(`Fetch Torrents Response OK: ${resp.ok}`)
	const data = await resp.json()

	if (!data.length) {
		console.debug("No torrents found to delete.")
		return
	}

	// Parse finished torrents, build up hashes in an array
	const hashes = []
	const deletion_torrents = []
	data.forEach((torrent) => {
		console.debug(`Qualifying for deletion: ${torrent.name}`)
		let expired = true
		let seeded = true
		if (config.delete_after_time) {
			const completed = new Date(torrent.completion_on * 1000)
			const now = new Date()
			// Get delta in minutes
			const delta = (now.getTime() - completed.getTime()) / 1000 / 60
			console.debug(`Torrent finished ${delta.toFixed(2)} minutes ago.`)
			if (delta < config.delete_after_time) {
				console.debug(`Torrent has not expired (${config.delete_after_time} minutes).`)
				expired = false
			}
		}
		if (config.delete_after_ratio && torrent.ratio < config.delete_after_ratio) {
			console.debug(
				`Torrent has not met seeding ratio. 
				${torrent.ratio.toFixed(2)} < ${config.delete_after_ratio}`
			)
			seeded = false
		}
		if (config.delete_requires_all_conditions && (!expired || !seeded)) {
			console.debug("Delete requires all conditions and a condition wasn't met. Skipping.")
		} else if (expired || seeded) {
			console.debug("Torrent qualifies for deletion.")
			hashes.push(torrent.hash)
			deletion_torrents.push(torrent)
		}
	})

	if (!hashes.length) {
		console.debug("No qualifying torrents found for deletion.")
		return
	}

	// Delete finished torrents
	console.debug(`Removing ${hashes.length} torrent(s)...`)
	resp = await fetch(`${config.server}/api/v2/torrents/delete?` + new URLSearchParams({
		hashes: hashes.join("|"),
		deleteFiles: "false"
	}),
	{
		method: "GET",
		mode: "no-cors"
	})
	console.debug(`Delete Torrents Response OK: ${resp.ok}`)
	if (!resp.ok) {
		return
	}

	deletion_torrents.forEach((torrent) => {
		// Pop title
		const matches = torrent.name.match(new RegExp(config.match_pattern, "i"))
		const title = matches[1].split(".").join(" ").trim()
		sendNotification(null, "Torrent Deleted", `${title} ${matches[2]}`)
	})
}


function init() {
	console.debug(`Config:`)
	console.debug(config)
	chrome.declarativeNetRequest.getDynamicRules((rules) => {
		console.debug(`Existing DNR Rules: ${rules.length}`)
		let ruleIds = []
		rules.forEach((rule) => {
			ruleIds.push(rule.id)
		})

		// Remove `Origin` header from requests (especially login), as it causes failures otherwise
		chrome.declarativeNetRequest.updateDynamicRules({
			addRules: [{
				action: {
					type: "modifyHeaders",
					requestHeaders: [
						{"header": "Origin", "operation": "remove"},
						{"header": "Referer", "operation": "set", "value": config.server}
					]
				},
				condition: {"urlFilter": `${config.server}/api/*`, "resourceTypes": ["xmlhttprequest"]},
				id: 1,
				priority: 1
			}],
			removeRuleIds: ruleIds
		}).catch(() => {})
	})

	if (config.auto_delete) {
		createAlarm()
		// clearFinishedTorrents().catch(() => {})
	} else {
		chrome.alarms.clear("torrent_delete").catch(() => {})
	}
	console.debug("Initialized.")
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	getConfig(() => {
		try {
			// Get link URL
			const link = info.linkUrl
			if (!link.startsWith("magnet:?xt")) {
				console.error(`Invalid Magnet link. Missing \`dn\` key! Aborting! ${link}`)
				sendNotification(
					null,
					"Torrent add failed!",
					`Unable to parse as a magnet link! ${link}`
				)
				return
			}
			parseLink(link)
		} catch (e) {
			sendNotification(null, "FATAL ERROR", e)
			console.error(e)
		}
	})
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.debug(`Received Message from ${sender}.`)
	console.debug(`Message: ${request}`)
	if (request.action === "reloadConfig") {
		console.debug("Reload Config Message")
		getConfig(() => {
			init()
			sendResponse({detail: "OK"})
		})
	}
})

chrome.alarms.onAlarm.addListener(() => {
	getConfig(() => {
		clearFinishedTorrents().catch(() => {})
	})
})

getConfig((config) => { 
	if (config === null) {
		setConfig(defaultConfig)
	}
	init()
})
