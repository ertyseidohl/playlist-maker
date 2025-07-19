import { SpotifyApi } from "@spotify/web-api-ts-sdk";

import * as readline from "readline/promises";
import { readFile, writeFile } from "fs/promises";
import process from "process";
import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.CLIENT_ID!;
const clientSecret = process.env.CLIENT_SECRET!;
const redirectUri = process.env.REDIRECT_URI!;
const state = process.env.STATE!;

interface PlayedTrack {
  context: any;
  played_at: string | null;
  track: {
    url: string;
    name: string;
    artists: string[];
    album: string;
    albumUrl: string;
    id: string;
  };
}

const scopes = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-recently-played",
];

let spotifyApi: SpotifyApi;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function extractCode(str: string): string {
  if (!str.startsWith("http")) {
    return str;
  }
  const match = str.match(/code=([^&]+)/);
  if (match && match[1]) {
    return match[1];
  } else {
    throw new Error("Authorization code not found in the URL.");
  }
}

async function getAuthCode() {
  try {
    console.log("Checking for existing auth code...");
    const authCodeData = JSON.parse(await readFile("authCode.json", "utf8"));
    console.log("Auth code data:", authCodeData);
    if (
      authCodeData &&
      authCodeData.code &&
      authCodeData.expires_at > Date.now()
    ) {
      spotifyApi = SpotifyApi.withAccessToken(clientId, {
        access_token: authCodeData.code,
        token_type: "Bearer",
        expires_in: Math.floor((authCodeData.expires_at - Date.now()) / 1000),
        refresh_token: "",
      });
      return authCodeData.code;
    }
  } catch (error) {
    console.log("No valid auth code found, requesting a new one.");
  }

  console.log("Requesting new authorization code...");

  const authorizeURL =
    `https://accounts.spotify.com/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes.join(" "))}&` +
    `state=${state}`;

  console.log("Authorize URL:", authorizeURL);

  const code = extractCode(
    await rl.question("Please copy and paste the URL you were redirected to: ")
  );

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok) {
    throw new Error(
      `Failed to get access token: ${
        tokenData.error_description || tokenData.error
      }`
    );
  }

  spotifyApi = SpotifyApi.withAccessToken(clientId, {
    access_token: tokenData.access_token,
    token_type: "Bearer",
    expires_in: tokenData.expires_in,
    refresh_token: tokenData.refresh_token || "",
  });

  writeFile(
    "authCode.json",
    JSON.stringify({
      code: tokenData.access_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    }),
    "utf8"
  );

  return tokenData.access_token;
}

async function getPlayedTracksInTimeRange() {
  const afterInput = await rl.question("Enter the start date (YYYY-MM-DD): ");
  const beforeInput = await rl.question("Enter the end date (YYYY-MM-DD): ");
  const after = new Date(afterInput).getTime();
  const before = new Date(beforeInput).getTime();

  console.log(
    `Fetching recently played tracks from ${new Date(
      after
    ).toISOString()} to ${new Date(before).toISOString()}...`
  );

  const recentlyPlayed: PlayedTrack[] = [];
  let earliestPlayedAt = before;
  let done = false;

  while (!done) {
    console.log(
      `Fetching up to 50 tracks played before ${new Date(
        earliestPlayedAt
      ).toISOString()}...`
    );

    const response = await spotifyApi.player.getRecentlyPlayedTracks(50, {
      timestamp: earliestPlayedAt,
      type: "before",
    });

    const tracks: PlayedTrack[] = response.items.map((item) => {
      return {
        context: item.context,
        played_at: item.played_at,
        track: {
          url: item.track.external_urls.spotify,
          name: item.track.name,
          artists: item.track.artists.map((artist: any) => artist.name),
          album: item.track.album.name,
          albumUrl: item.track.album.external_urls.spotify,
          id: item.track.id,
        },
      };
    });

    recentlyPlayed.push(...tracks);
    console.log(
      `Fetched ${tracks.length} tracks, earliest played at: ${
        tracks[tracks.length - 1]?.played_at
      }`
    );

    await writeFile("response.json", JSON.stringify(response, null, 2));

    if (response.cursors?.before && tracks.length > 0) {
      const lastTrack = tracks[tracks.length - 1];
      if (lastTrack?.played_at) {
        earliestPlayedAt = new Date(lastTrack.played_at).getTime();
        if (earliestPlayedAt < after) {
          done = true;
        }
      } else {
        done = true;
      }
    } else {
      done = true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const filteredTracks = recentlyPlayed.filter((track) => {
    if (!track.played_at) return false;
    const playedAtTime = new Date(track.played_at).getTime();
    return playedAtTime >= after && playedAtTime <= before;
  });

  console.log(
    `Total fetched ${recentlyPlayed.length} tracks, ${filteredTracks.length} in the specified date range`
  );

  return filteredTracks;
}

async function run() {
  const accessToken = await getAuthCode();

  const playedTracksInTimeRange = await getPlayedTracksInTimeRange();

  console.log("Done fetching");

  await writeFile(
    "recentlyPlayed.json",
    JSON.stringify(playedTracksInTimeRange, null, 2),
    "utf8"
  );

  console.log("Done!");

  rl.close();
}

run();
