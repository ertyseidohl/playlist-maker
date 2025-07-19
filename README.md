# Playlist Maker

Make a spotify playlist from the tracks you played during a specific time range

## How to Run

Install:

```bash
git clone <this repo>
cd playlist-maker
npm install
```

Next, set up .env with your Spotify API secrets.

Note: `REDIRECT_URI` does not need to actually have a server running, you'll just need to copy the URL that Spotify forwards you to later.

Run:

```bash
npm run main
```

If you haven't run it before, or your token is expired, this will generate an auth url with a callback. Click on this and Spotify will redirect you to a url (starting with `REDIRECT_URI`). Copy this URL and paste it in the terminal.

Now, the script will ask you for start and end dates (NOTE: anything too long ago will return nothing - see "Bug" below).

Next, it will fetch your played items during that time window, and write the data to recentlyPlayed.json. It will write the raw response to response.json.

If Spotify fixes the bug with getRecentlyPlayedTracks, I'll get the playlist generation working 🙂

## Bug

`getRecentlyPlayedTracks` only returns the most recent 50 tracks from now. Unfortunately, that means that this script fails for any dates outside that range.

Hopefully with this example app, Spotify will fix this and we'll be able to see our music history (without having to wait 30 days for a full account export).

The data is currently available to users, since it's accessible on the mobile app.

If you work at Spotify and you are reading this, thank you!!
