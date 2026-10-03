# AMC Report Builder: setup, deploy and git guide

What you get: a web app that saves every client, month and balance online, signs you in with Google, and exports Word and PDF. It costs nothing at this size.

How the pieces fit:

| Piece | What it does | Cost |
|---|---|---|
| Your computer | Where you edit the code | Free |
| Git | Records every change you make | Free |
| GitHub | Stores the code online. Pushing here deploys the app | Free |
| Firebase Hosting | Serves the website | Free |
| Firebase Firestore | Stores clients, months and hour balances | Free |
| Firebase Auth | Google sign-in, so only you can open it | Free |

---

## Part 1. Install the tools (once)

1. **Node.js** (LTS version): https://nodejs.org
2. **Git**: https://git-scm.com/downloads
3. A **GitHub** account: https://github.com
4. Open a terminal and check:

```
node -v
git --version
```

Tell git who you are (once per computer):

```
git config --global user.name "Your Name"
git config --global user.email "you@siamcomputing.com"
```

---

## Part 2. Try it on your computer

Unzip the project, open a terminal in that folder, then:

```
npm start
```

Open http://localhost:5173. Right now the app is in "Saved in this browser only" mode. That is fine for trying things.

To load your four clients and their history: click **Restore** (top right) and pick `seed/starter-data.json`.

Stop the server with `Ctrl + C`.

---

## Part 3. Create the free online database and login (Firebase)

Go to https://console.firebase.google.com and sign in with Google.

1. **Add project**. Give it a name such as `amc-report-builder`. Turn Google Analytics **off**. Create.
2. **Build > Firestore Database > Create database**. Pick the location `asia-south1 (Mumbai)`. Choose **Production mode**. Enable.
3. **Build > Authentication > Get started > Sign-in method > Google**. Enable it, choose a support email, Save.
4. **Project settings (gear icon) > General > Your apps > the `</>` web icon**. Give the app a nickname, register it, and copy the `firebaseConfig` block.
5. Open `public/js/firebase-config.js` and paste the values in, as in the example inside that file.
6. Open `firestore.rules` and replace `REPLACE_WITH_YOUR_EMAIL@example.com` with your Google email. To let a teammate in, add theirs inside the brackets, separated by a comma.

⚠ Once step 5 is done, running `npm start` on your computer connects to the **real online data**. If you want to test something risky, click **Back up** first, or set `firebaseConfig` back to `null` while testing.

---

## Part 4. Put the code on GitHub

In the project folder:

```
git init -b main
git add .
git commit -m "First version"
```

On GitHub, click **New repository**. Name it `amc-report-builder`, choose **Private**, and leave "Add a README" unticked. Copy the repo address it shows, then run:

```
git remote add origin https://github.com/YOUR-USERNAME/amc-report-builder.git
git push -u origin main
```

A browser window opens to sign you in to GitHub the first time.

`seed/` (your client data) and `node_modules/` are in `.gitignore`, so they are never uploaded.

---

## Part 5. Deploy, and make every push deploy automatically

```
npm install -g firebase-tools
firebase login
firebase use --add
```

Pick your project when asked, and give it the alias `default`.

Publish the access rules and the first version of the site:

```
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

The last command prints your live address, like `https://your-project.web.app`. Open it, sign in with Google, click **Restore**, and choose `seed/starter-data.json`. Your clients and history are now saved online.

Now connect GitHub so that pushing deploys:

```
firebase init hosting:github
```

Answer the questions like this:

- Repository: `YOUR-USERNAME/amc-report-builder`
- Run a build script before every deploy? **No**
- Deploy automatically when a PR is merged? **Yes**
- Branch for the live site: **main**

It creates two files in `.github/workflows/` and stores the deploy key in GitHub for you. Upload them:

```
git add .
git commit -m "Add automatic deploy"
git push
```

Open your repo on GitHub, then the **Actions** tab. You will see a run turn green. From now on, every push to `main` updates the live app in about a minute.

⚠ Rules are not part of that automatic deploy. If you ever change `firestore.rules`, run `firebase deploy --only firestore:rules` yourself.

---

## Part 6. Your everyday git routine

Make a change in your editor, then:

```
git status               # which files changed
git diff                 # exactly what changed, line by line
git add -A               # choose everything for the next save point
git commit -m "Short note about what you changed"
git push                 # upload it, and the live app updates
```

Good commit messages say what and why in one line: `Add 20% low-hours warning`, `Fix PDF page break on long summaries`.

### Safer way for bigger changes: a branch and a preview

```
git switch -c renewal-option          # new branch, your own working copy
# ...edit, then...
git add -A
git commit -m "Add contract renewal option"
git push -u origin renewal-option
```

On GitHub, click **Compare & pull request**, then **Create pull request**. A bot comments with a temporary preview link, so you can try the change online before it is live. When you are happy, click **Merge pull request**. That deploys it. Then clean up locally:

```
git switch main
git pull
```

⚠ The preview link uses the same real database as the live app.

### Undo cheat sheet

| I want to... | Run |
|---|---|
| Throw away edits in a file I haven't committed | `git restore path/to/file` |
| Remove a file from the next commit (keep my edits) | `git restore --staged path/to/file` |
| See my history | `git log --oneline` |
| Undo a commit that is already pushed | `git revert HEAD` then `git push` |
| Get the latest from GitHub (new machine, teammate) | `git pull` |
| Start on a second computer | `git clone <repo address>` |

If `git push` says it was rejected, someone (or another computer) pushed first. Run `git pull`, then `git push` again.

---

## Where things live

| File or folder | What it is |
|---|---|
| `public/index.html` | The page |
| `public/css/style.css` | Colours and layout |
| `public/img/` | Siam logo and watermark used on the preview, Word and PDF letterhead |
| `public/js/core.js` | Hour maths, summary wording, Word and PDF layout |
| `public/js/ui.js` | The screen: forms, buttons, preview |
| `public/js/store.js` | Saving and loading (Firestore online, or this browser) |
| `public/js/firebase-config.js` | Your Firebase connection details |
| `firestore.rules` | Who may read and write the data |
| `tests/core.test.mjs` | Checks the hour maths against your real reports. Run `npm test` |
| `seed/` | Your starter data. Stays on your computer |

The Word and PDF letterhead (logo, website line, tagline, watermark, page number) copies the Siam Computing template PDF. Its positions are in `core.js` (`LH`).

Typical changes: report wording is in `core.js` (`genSummary`), report layout is in `core.js` (`sectionDocx` for Word, `buildPdfDoc` for PDF), colours are the first lines of `style.css`.

## Good habits

- Click **Back up** once a month and keep the file somewhere safe.
- Run `npm test` before you push a change that touches `core.js`.
- The free Firebase plan gives 1 GiB of storage and 50,000 reads a day. Four to forty clients will use a tiny fraction of that.
- Downloading Word or PDF also saves the month, so the next month always starts from the right balance.
