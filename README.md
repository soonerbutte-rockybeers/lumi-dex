# Lumi Dex — Luminescent Platinum companion for the AYN Thor

Offline-capable Pokédex, route guide, and team builder built from the
Luminescent 2.2F game data (TeamLumi/luminescent-team). Sized for the
Thor's 3.92" 1080×1240 bottom screen.

## Put it on GitHub Pages

One-time setup. Do this on the Mac.

1. On github.com, click "New repository". Name it `lumi-dex`, Public, no README. Create it.
2. Unzip lumi-dex.zip. You'll have a folder called `app`.
3. COPY THIS INTO THE MAC (Terminal), one line at a time, replacing YOURNAME with your GitHub username:

    cd ~/Downloads/app
    git init -b main
    git add .
    git commit -m "Lumi Dex"
    git remote add origin https://github.com/YOURNAME/lumi-dex.git
    git push -u origin main

4. On github.com → your repo → Settings → Pages → "Build and deployment":
   Source = "Deploy from a branch", Branch = main, folder = / (root). Save.
5. Wait about a minute. The app is at https://YOURNAME.github.io/lumi-dex/

## Install it on the Thor

1. Open Chrome on the Thor and go to the URL above.
2. Chrome menu (⋮) → "Add to Home screen" / "Install app".
3. Open it from the home screen. It runs full-screen as its own app; send it to the bottom screen like any other app.
4. Inside the app: gear icon → "Cache all sprites" → Download. After that it works with no connection.

## Updating

Change files in the `app` folder, then on the Mac:

    cd ~/Downloads/app && git add . && git commit -m "update" && git push

The app picks up the update the next time it's opened with a connection.
