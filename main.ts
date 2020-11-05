import { App, ButtonComponent, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent } from 'obsidian';

export default class Review extends Plugin {
	settings: ReviewSettings;

	async onload() {
		console.log('Loading the Review plugin.');

		// Check that plugins can be accessed.
		console.log(app.plugins.plugins);

		// Check for the Natural Language Dates plugin. If not found, tell the user to install it/initialize it.
		let naturalLanguageDates = app.plugins.getPlugin('nldates-obsidian');
		if (!naturalLanguageDates) {
			new Notice("The Natural Language Dates plugin was not found. The Review plugin requires the Natural Language Dates plugin. Please install it first and make sure it is enabled before using Review.");
		}

		this.settings = (await this.loadData()) || new ReviewSettings();

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

		this.addSettingTab(new ReviewSettingTab(this.app, this));

	}

	onunload() {
		console.log('The Review Dates plugin has been disabled and unloaded.');
	}

	setReviewDate(someDate: string) {
		let obsidianApp = this.app;
		let naturalLanguageDates = obsidianApp.plugins.getPlugin('nldates-obsidian'); // Get the Natural Language Dates plugin.
		let inputDate = naturalLanguageDates.processDate(naturalLanguageDates, someDate);
		let notesFolder = this.settings.dailyNoteLocation;
		if (notesFolder === "") {
			let notesPath = "/";
		} else {
			let notesPath = "/" + notesFolder + "/";
		}
		let reviewHeading = this.settings.reviewSectionHeading;
		console.log("Date string to use: " + inputDate);
		if (!(inputDate === "Invalid date")) {
			// get the current note name
			let noteName = obsidianApp.workspace.activeLeaf.getDisplayText();


			// check if the file exists
			let files = obsidianApp.vault.getFiles();
			const dateFile = files.filter(e => e.name === inputDate //hat-tip 🎩 to @MrJackPhil for this little workflow 
				|| e.path === inputDate
				|| e.basename === inputDate
			)[0];

			console.log("File found:" + dateFile);
			if (!dateFile) { //the file does not already exist
				console.log("The daily note for the given date does not exist yet. Creating it, then appending the review section.")
				let noteText = reviewHeading + "\n- [[" + noteName + "]]";
				let newDateFile = obsidianApp.vault.create(notesPath + inputDate + ".md", noteText);
				new Notice("Set note \"" + noteName + "\" for review on " + inputDate + ".");
			} else { //the file exists
				console.log("The daily note already exists for the date given. Adding this note to it for review.")
				let previousNoteText = "";
				obsidianApp.vault.read(dateFile).then(function (result) { // Get the text in the note. Search it for ## Review and append to that section. Else, append ## Review and the link to the note for review.
					let previousNoteText = result;
					console.log("Previous Note text:\n" + previousNoteText);
					let newNoteText = "";
					if (previousNoteText.includes(reviewHeading)) {
						newNoteText = previousNoteText.replace(reviewHeading + "\n", reviewHeading + "\n- [[" + noteName + "]]\n");
					} else {
						newNoteText = previousNoteText + "\n" + reviewHeading + "\n- [[" + noteName + "]]\n";
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

class ReviewSettings {
	dailyNoteLocation = "";
	reviewSectionHeading = "## Review";
}

class ReviewModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let _this = this;
		console.log(_this);
		let { contentEl } = this;
		let inputDateField = new TextComponent(contentEl)
			.setPlaceholder("tomorrow");
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

class ReviewSettingTab extends PluginSettingTab {
	display(): void {
		let { containerEl } = this;
		const plugin: any = (this as any).plugin;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Review settings' });

		new Setting(containerEl)
			.setName('Daily note location')
			.setDesc('Set the path to your daily notes. Use the format "folder/subfolder". Do not use leading or trailing slashes "/".')
			.addText((text) =>
				text
					.setPlaceholder('†')
					.setValue(plugin.settings.dailyNotesFolder)
					.onChange((value) => {
						plugin.settings.dailyNotesFolder = value;
						plugin.saveData(plugin.settings);
					})
			);
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
	}
}
