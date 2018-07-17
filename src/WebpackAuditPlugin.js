const lighthouse = require('lighthouse')
const chromeLauncher = require('chrome-launcher')
const chalk = require('chalk')
const invariant = require('invariant')
const request = require('request')

/**
 * The WebpackAuditPlugin runs a site through a headless chrome instance when production mode is enabled
 *
 * @class WebpackAuditPlugin
 */
class WebpackAuditPlugin {
	/**
	 * @param {Object} options
	 * @return {undefined}
	 */
	constructor(options) {
		this.options = {
			...{
				modes: ['production'],
				scoreThreshold: 1,
				chromeOptions: {
					chromeFlags: ['--show-paint-rects', '--headless', '--disable-gpu'],
				},
			},
			...options,
		}

		console.log(this.options)

		invariant(this.options.hasOwnProperty('url') && this.options.url.length, 'no URL passed to the WebpackAuditPlugin constructor')
	}

	/**
	 * Executes the plugin
	 *
	 * @param {Object} compiler
	 * @return {undefined}
	 */
	apply(compiler) {
		// abort when the mode is not production
		if (!this.options.modes.includes(compiler.options.mode)) {
			return
		}

		this.runLighthouseAudit().then(audits => {
			audits.forEach(audit => {

				const color = audit.score === 0 ? 'red' : 'yellow'
				const icon = audit.score === 0 ? '✖' : '⚠'

				this.displayMessage(
					audit.score === 0 ? 'error' : 'warning',
					`${audit.title} [${audit.score * 100}/100]`,
					audit.description,
				)
			})
		})

		this.runValidatorAudit().then(audits => {
			audits.forEach(audit => {
				this.displayMessage(
					audit.type,
					`${audit.message} line ${audit.lastLine}, column ${audit.firstColumn}`,
					audit.extract.replace(/(\r\n\t|\n|\r\t)/gm, '')
				)
			})
		})
	}

	/**
	 * @param {string} type
	 * @param {string} text
	 */
	displayMessage(type, text, description) {
		const color = type === 'error' ? 'red' : 'yellow'
		const icon = type === 'error' ? '✖' : '⚠'
		console.log(chalk.underline[color](`${icon}  ${text}`))
		if (description) {
			console.log(description)
		}
	}

	/**
	 * @return {Promise}
	 */
	runLighthouseAudit() {
		return new Promise((resolve, reject) => {
			chromeLauncher.launch(this.options.chromeOptions).then(chrome => {
				const lighthouseOptions = {
					...this.options.chromeOptions,
					port: chrome.port,
				}

				lighthouse(this.options.url, lighthouseOptions, null).then(result => {
					// get the failed audits
					const audits = Object.values(result.lhr.audits)
						.filter(audit => audit.score !== null && audit.score < this.options.scoreThreshold)

					// sort by score
					audits.sort((a, b) => b.score - a.score)

					chrome.kill()

					resolve(audits)
				})
			})
		})
	}

	/**
	 * @return {Promise}
	 */
	runValidatorAudit() {
		return new Promise((resolve, reject) => {
			const options = {
				url: `https://validator.nu/?doc=${this.options.url}&out=json`,
				headers: {
					'User-Agent': 'webpack-audit-plugin',
				},
			}

			request(options, (error, response, body) => {
				const payload = JSON.parse(body)
				if (payload.hasOwnProperty('messages')) {
					resolve(payload.messages)
				}
			})
		})
	}
}

module.exports = WebpackAuditPlugin
