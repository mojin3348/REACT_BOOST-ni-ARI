const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = typeof cookie === "string" ? JSON.parse(cookie) : cookie;
      const sbCookie = cookies.find(c => c.key === "sb");

      if (!sbCookie) {
        return reject("❌ Invalid appstate: missing sb cookie");
      }

      const sbValue = sbCookie.value;
      const data = `sb=${sbValue}; ${cookies
        .filter(c => c.key !== "sb")
        .map(c => `${c.key}=${decodeURIComponent(c.value)}`)
        .join("; ")}`;

      resolve(data);
    } catch (error) {
      reject("❌ Error processing appstate, please provide a valid fbstate");
    }
  });
}

async function extractTokens(cookie) {
  const headers = {
    cookie,
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10; FBAN/FB4A; FBAV/400.0.0.12.115)"
  };

  const res = await axios.get(
    "https://m.facebook.com/composer/ocelot/async_loader/?publisher=feed",
    { headers }
  );
  const html = res.data;

  const fb_dtsg =
    html.match(/"fb_dtsg"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/name="fb_dtsg" value="([^"]+)"/)?.[1];

  const lsd =
    html.match(/"lsd"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"LSD",\[],{"token":"([^"]+)"}/)?.[1];

  const jazoest = html.match(/name="jazoest" value="([^"]+)"/)?.[1];
  const userId = cookie.match(/c_user=(\d+)/)?.[1];

  return { fb_dtsg, lsd, jazoest, userId };
}

function extractPostId(url) {
  return (
    url.match(/story_fbid=(\d+)/)?.[1] ||
    url.match(/\/posts\/(\d+)/)?.[1] ||
    url.match(/\/videos\/(\d+)/)?.[1] ||
    url.match(/\/(\d{6,})(?:\/|\?|$)/)?.[1]
  );
}

app.post("/react", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit = 1 } = req.body;
    if (!appstate || !postLink || !reactionType) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const cookie = await convertCookie(appstate);

    const tokens = await extractTokens(cookie);
    if (!tokens.fb_dtsg) throw new Error("❌ Token extraction failed");

    const postId = extractPostId(postLink);
    if (!postId) throw new Error("❌ Invalid post link");

    let success = 0,
      fail = 0;

    for (let i = 0; i < limit; i++) {
      try {
        const form = new URLSearchParams({
          av: tokens.userId,
          __user: tokens.userId,
          fb_dtsg: tokens.fb_dtsg,
          jazoest: tokens.jazoest,
          lsd: tokens.lsd,
          __spin_b: "trunk",
          fb_api_req_friendly_name: "CometUFIFeedbackReactMutation",
          doc_id: "2403499796277671",
          variables: JSON.stringify({
            input: {
              feedback_id: postId,
              feedback_reaction: reactionType,
              actor_id: tokens.userId,
              client_mutation_id: String(Date.now())
            }
          })
        });

        await axios.post("https://www.facebook.com/api/graphql/", form, {
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie,
            "user-agent":
              "Mozilla/5.0 (Linux; Android 10; FBAN/FB4A; FBAV/400.0.0.12.115)"
          }
        });
        success++;
      } catch {
        fail++;
      }
    }

    res.json({
      reacted: success,
      failed: fail,
      account: tokens.userId
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 API ready on http://localhost:${PORT}`)
);
