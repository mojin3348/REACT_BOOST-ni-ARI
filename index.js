const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

async function extractTokens(cookie) {
  try {
    const headers = {
      cookie,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    };

    const res = await axios.get("https://www.facebook.com/", { headers });
    const page = res.data;

    const fb_dtsg = page.match(/"DTSGInitialData",\[],{"token":"([^"]+)"}/)?.[1];
    const lsd = page.match(/"LSD",\[],{"token":"([^"]+)"}/)?.[1];
    const jazoest = page.match(/name="jazoest" value="([^"]+)"/)?.[1];
    const spin_r = page.match(/"__spin_r":([0-9]+)/)?.[1];
    const spin_t = page.match(/"__spin_t":([0-9]+)/)?.[1];
    const userId = cookie.match(/c_user=(\d+)/)?.[1];

    return { fb_dtsg, lsd, jazoest, spin_r, spin_t, userId };
  } catch (err) {
    console.error("❌ Failed extracting tokens:", err.message);
    return null;
  }
}

function extractPostIdFromUrl(url) {
  let postId = null;
  const storyMatch = url.match(/story_fbid=(\d+)/);
  const postMatch = url.match(/\/posts\/(\d+)/);
  const videoMatch = url.match(/\/videos\/(\d+)/);
  const directId = url.match(/\/(\d{6,})(?:\/|\?|$)/);

  if (storyMatch) postId = storyMatch[1];
  else if (postMatch) postId = postMatch[1];
  else if (videoMatch) postId = videoMatch[1];
  else if (directId) postId = directId[1];

  return postId;
}

app.post("/react", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit } = req.body;
    if (!appstate || !postLink || !reactionType) {
      return res.status(400).json({ error: "❌ Missing required fields" });
    }

    const postId = extractPostIdFromUrl(postLink);
    if (!postId) {
      return res.status(400).json({ error: "❌ Could not extract post ID from the given link" });
    }

    const cookie = appstate.map(c => `${c.key}=${c.value}`).join("; ");

    const tokens = await extractTokens(cookie);
    if (!tokens || !tokens.fb_dtsg) {
      return res.status(500).json({ error: "❌ Failed to extract fb_dtsg/lsd/jazoest" });
    }

    let success = 0, fail = 0;
    for (let i = 0; i < (limit || 1); i++) {
      try {
        const formData = new URLSearchParams({
          av: tokens.userId,
          __user: tokens.userId,
          fb_dtsg: tokens.fb_dtsg,
          jazoest: tokens.jazoest,
          lsd: tokens.lsd,
          __spin_r: tokens.spin_r,
          __spin_b: "trunk",
          __spin_t: tokens.spin_t,
          fb_api_req_friendly_name: "CometUFIFeedbackReactMutation",
          doc_id: "2403499796277671",
          variables: JSON.stringify({
            input: {
              attribution_id_v2: "ProfileCometTimelineListViewRoot.react",
              feedback_id: postId,
              feedback_reaction: reactionType,
              feedback_source: "PROFILE",
              is_tracking_encrypted: true,
              actor_id: tokens.userId,
              client_mutation_id: String(i + 1)
            }
          })
        });

        await axios.post("https://www.facebook.com/api/graphql/", formData, {
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });

        success++;
      } catch (err) {
        fail++;
      }
    }

    return res.json({ success: true, reacted: success, failed: fail, postId });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 ReactBoost server running at http://localhost:${PORT}`)
);
