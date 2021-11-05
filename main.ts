import { App, ButtonComponent, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import { createDailyNote, getDailyNoteSettings } from 'obsidian-daily-notes-interface';

interface IReviewSettings {
	dailyNotesFolder: string;
	reviewSectionHeading: string;
	linePrefix: string;
	defaultReviewDate: string;
	blockLinePrefix: string;
}

const DEFAULT_SETTINGS: IReviewSettings = {
	dailyNotesFolder: "",
	reviewSectionHeading: "## Review",
	linePrefix: "- ",
	defaultReviewDate: "tomorrow",
	blockLinePrefix: "!",
}


export default class Review extends Plugin {
	settings: IReviewSettings;

	async onload() {
		console.log('Loading the Review plugin v1.6.4.');

		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()))

		if (this.app.workspace.layoutReady) {
			this.onLayoutReady();
		} else {
			this.app.workspace.on("layout-ready", this.onLayoutReady.bind(this));
		}

		this.addCommand({
			id: 'future-review',
			name: 'Add this note to a daily note for review',

			checkCallback: (checking: boolean) => { // If a note is currently active, open the plugin's modal to receive a date string.
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						new ReviewModal(this.app).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'future-review-block',
			name: 'Add this block to a daily note for review',

			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						new ReviewBlockModal(this.app).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addSettingTab(new ReviewSettingTab(this.app, this));

	}

	onLayoutReady() {
		// Check for the Natural Language Dates plugin after all the plugins are loaded.
		// If not found, tell the user to install it/initialize it.
		let naturalLanguageDates = (<any>this.app).plugins.getPlugin('nldates-obsidian');
		if (!naturalLanguageDates) {
			new Notice("The Natural Language Dates plugin was not found. The Review plugin requires the Natural Language Dates plugin. Please install it first and make sure it is enabled before using Review.");
		}
	}

	onunload() {
		console.log('The Review Dates plugin has been disabled and unloaded.');
	}

	createBlockHash(inputText: string): string { // Credit to https://stackoverflow.com/a/1349426
		let result = '';
		var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for ( var i = 0; i < 7; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}

	getBlock(inputLine: string, noteFile: object): string { //Returns the string of a block ID if block is found, or "" if not.
		let obsidianApp = this.app;
		let noteBlocks = obsidianApp.metadataCache.getFileCache(noteFile).blocks;
		console.log("Checking if line '" + inputLine + "' is a block.");
		let blockString = "";
		if (noteBlocks) { // the file does contain blocks. If not, return ""
			for (let eachBlock in noteBlocks) { // iterate through the blocks. 
				console.log("Checking block ^" + eachBlock);
				let blockRegExp = new RegExp("(" + eachBlock + ")$", "gim");
				if (inputLine.match(blockRegExp)) { // if end of inputLine matches block, return it
					blockString = eachBlock;
					console.log("Found block ^" + blockString);
					return blockString;
				} 
			}
			return blockString;
		} 
		return blockString;
	}

	async setReviewDate(someDate: string, someBlock?: string) {
		let obsidianApp = this.app;
		let naturalLanguageDates = obsidianApp.plugins.getPlugin('nldates-obsidian'); // Get the Natural Language Dates plugin.
		let notesFolder = await getDailyNoteSettings().folder;


		if (!naturalLanguageDates) {
			new Notice("The Natural Language Dates plugin is not available. Please make sure it is installed and enabled before trying again.");
			return;
		}

		if (someDate === "") {
			someDate = this.settings.defaultReviewDate;
		}
		// Use the Natural Language Dates plugin's processDate method to convert the input date into a daily note title.
		let parsedResult = naturalLanguageDates.parseDate(someDate);
		let inputDate = parsedResult.formattedString;


		console.debug("Date string to use: " + inputDate);

		// Get the folder path.
		let notesPath = "";
		if (notesFolder === "") {
			notesPath = "/"; // If the user is using the root for their daily notes, don't add a second /.
		} else {
			notesPath = "/" + notesFolder + "/";
		}
		console.debug("The path to daily notes: " + notesPath);

		// Get the review section header.
		let reviewHeading = this.settings.reviewSectionHeading;
		console.debug("The review section heading is: " + reviewHeading);

		// Get the line prefix.
		let reviewLinePrefix = this.settings.linePrefix;
		console.debug("The line prefix is: " + reviewLinePrefix);

		// If the date is recognized and valid
		if (parsedResult.moment.isValid()) {
			// get the current note name
			let noteName = obsidianApp.workspace.activeLeaf.getDisplayText();
			let noteFile = obsidianApp.workspace.activeLeaf.view.file;
			let noteLink = obsidianApp.metadataCache.fileToLinktext(noteFile, noteFile.path, true);

			if (someBlock != undefined) {
				console.log("Checking for block:");
				let lineBlockID = this.getBlock(someBlock, noteFile);
				console.debug(lineBlockID);

				if (this.getBlock(someBlock, noteFile) === "") { // The line is not already a block
					console.debug("This line is not currently a block. Adding a block ID.");
					lineBlockID = this.createBlockHash(someBlock).toString();
					let lineWithBlock = someBlock + " ^" + lineBlockID;
					obsidianApp.vault.read(noteFile).then(function (result) {
						let previousNoteText = result;
						let newNoteText = previousNoteText.replace(someBlock, lineWithBlock);
						obsidianApp.vault.modify(noteFile, newNoteText);
					})
				}
				noteLink = noteLink + "#^" + lineBlockID;
				reviewLinePrefix = this.settings.blockLinePrefix;
			}

			// check if the daily note file exists
			let files = obsidianApp.vault.getFiles();
			const dateFile = files.filter(e => e.name === inputDate //hat-tip 🎩 to @MrJackPhil for this little workflow 
				|| e.path === inputDate
				|| e.basename === inputDate
			)[0];
			console.debug("File found:" + dateFile);

			if (!dateFile) { //the date file does not already exist
				console.debug("The daily note for the given date does not exist yet. Creating it, then appending the review section.")
				let noteText = reviewHeading + "\n" + reviewLinePrefix + "[[" + noteLink + "]]";
				// let newDateFile = obsidianApp.vault.create(notesPath + inputDate + ".md", noteText); //previous approach
				let newDateFile = await createDailyNote(parsedResult.moment); // Use @liamcain's obsidian-daily-notes-interface to create a daily note with core-defined templates
				let templateText = await obsidianApp.vault.read(newDateFile);
				//console.log(templateText); // for debugging
				if (templateText.includes(reviewHeading)) {
					noteText = templateText.replace(reviewHeading, noteText);
				} else {
					noteText = templateText + "\n" + noteText;
				}
				obsidianApp.vault.modify(newDateFile, noteText);
				new Notice("Set note \"" + noteName + "\" for review on " + inputDate + ".");
			} else {
				console.debug("The daily note already exists for the date given. Adding this note to it for review.")
				let previousNoteText = "";
				obsidianApp.vault.read(dateFile).then(function (result) { // Get the text in the note. Search it for ## Review and append to that section. Else, append ## Review and the link to the note for review.
					previousNoteText = result;
					console.log("Previous Note text:\n" + previousNoteText);
					let newNoteText = "";
					if (previousNoteText.includes(reviewHeading)) {
						newNoteText = previousNoteText.replace(reviewHeading, reviewHeading + "\n" + reviewLinePrefix + "[[" + noteLink + "]]");
					} else {
						newNoteText = previousNoteText + "\n" + reviewHeading + "\n" + reviewLinePrefix + "[[" + noteLink + "]]";
					}
					obsidianApp.vault.modify(dateFile, newNoteText);
					new Notice("Set note \"" + noteName + "\" for review on " + inputDate + ".");
				});
			}			
		} else {
			new Notice("You've entered an invalid date (note that \"two weeks\" will not work, but \"in two weeks\" will). The note was not set for review. Please try again.");
		}
		return;
	}
}

class ReviewModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let _this = this;
		console.debug(_this);
		let { contentEl } = this;
		let inputDateField = new TextComponent(contentEl)
			.setPlaceholder(this.app.plugins.getPlugin("review-obsidian").settings.defaultReviewDate);
		let inputButton = new ButtonComponent(contentEl)
			.setButtonText("Set Review Date")
			.onClick(() => {
				let inputDate = inputDateField.getValue();
				_this.app.plugins.getPlugin("review-obsidian").setReviewDate(inputDate);
				this.close();
			});
		inputDateField.inputEl.focus();
		inputDateField.inputEl.addEventListener('keypress', function (keypressed) {
			if (keypressed.key === 'Enter') {
				var inputDate = inputDateField.getValue()
				_this.app.plugins.getPlugin("review-obsidian").setReviewDate(inputDate);
				_this.close();
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

class ReviewBlockModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let _this = this;
		let editor = this.app.workspace.activeLeaf.view.sourceMode.cmEditor;
		let cursor = editor.getCursor();
		let lineText = editor.getLine(cursor.line);
		console.debug(_this);
		let { contentEl } = this;
		let inputDateField = new TextComponent(contentEl)
			.setPlaceholder(this.app.plugins.getPlugin("review-obsidian").settings.defaultReviewDate);
		let inputButton = new ButtonComponent(contentEl)
			.setButtonText("Set Review Date")
			.onClick(() => {
				let inputDate = inputDateField.getValue();
				_this.app.plugins.getPlugin("review-obsidian").setReviewDate(inputDate, lineText);
				this.close();
			});
		inputDateField.inputEl.focus();
		inputDateField.inputEl.addEventListener('keypress', function (keypressed) {
			if (keypressed.key === 'Enter') {
				var inputDate = inputDateField.getValue()
				_this.app.plugins.getPlugin("review-obsidian").setReviewDate(inputDate, lineText);
				_this.close();
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

class ReviewSettingTab extends PluginSettingTab {
	display(): void {
		let { containerEl } = this;
		const plugin: any = (this as any).plugin;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Review Settings' });

		new Setting(containerEl)
			.setName('Review section heading')
			.setDesc('Set the heading to use for the review section. BE CAREFUL: it must be unique in each daily note.')
			.addText((text) =>
				text
					.setPlaceholder('## Review')
					.setValue(plugin.settings.reviewSectionHeading)
					.onChange((value) => {
						if (value === "") {
							plugin.settings.reviewSectionHeading = "## Review";
						} else {
							plugin.settings.reviewSectionHeading = value;
						}
						plugin.saveData(plugin.settings);
					})
			);
		new Setting(containerEl)
			.setName('Line prefix')
			.setDesc('Set the prefix to use on each new line. E.g., use `- ` for bullets or `- [ ] ` for tasks. **Include the trailing space.**')
			.addText((text) =>
				text
					.setPlaceholder('- ')
					.setValue(plugin.settings.linePrefix)
					.onChange((value) => {
						plugin.settings.linePrefix = value;
						plugin.saveData(plugin.settings);
					})
			);
		new Setting(containerEl)
			.setName('Block review line prefix')
			.setDesc('Set the prefix used when adding blocks to daily notes with Review. Use e.g., `- [ ] ` to link the block as a task, or `!` to create embeds.')
			.addText((text) => 
				text
					.setPlaceholder('!')
					.setValue(plugin.settings.blockLinePrefix)
					.onChange((value) => {
						plugin.settings.blockLinePrefix = value;
						plugin.saveData(plugin.settings);
					})
			);
		new Setting(containerEl)
			.setName('Default review date')
			.setDesc('Set a default date to be used when no date is entered. Use natural language: "Next Monday", "November 5th", and "tomorrow" all work.')
			.addText((text) => 
				text
					.setPlaceholder('')
					.setValue(plugin.settings.defaultReviewDate)
					.onChange((value) => {
						plugin.settings.defaultReviewDate = value;
						plugin.saveData(plugin.settings);
					})
			);
		
		// containerEl.createEl('h3', { text: 'Preset review schedules' });

		/*
		TKTKTK: Figure out how to add a function to a button inside the setting element. Currently `doSomething`, below, throws errors.
		containerEl.createEl('button', { text: "Add a new review schedule preset", attr: { onclick: "doSomething({ console.log('button clicked') });"}});
		*/
	}	
}
