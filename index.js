const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

function normalizeAppstate(input) {
  try {
    let parsed = input;
    
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {
        try {
          const decoded = Buffer.from(parsed, "base64").toString("utf8");
          parsed = JSON.parse(decoded);
        } catch (e2) {
          throw new Error("Invalid appstate format");
        }
      }
    }

    // Final check: should be array
    if (!Array.isArray(parsed)) {
      throw new Error("Appstate is not an array");
    }

    return parsed.map(item => {
      let value = item.value;

      try {
        if (typeof value === "string" && value.includes("%")) {
          const decoded = decodeURIComponent(value);
          value = decoded;
        }
      } catch (_) {}

      return {
        key: item.key,
        value,
        domain: item.domain || "facebook.com",
        path: item.path || "/",
      };
    });
  } catch (e) {
    throw new Error("Invalid appstate JSON");
  }
}

function buildCookieFromAppstate(appstateStr) {
  const arr = normalizeAppstate(appstateStr);
  return arr.map(c => `${c.key}=${c.value}`).join("; ");
}

async function extractTokens(cookie) {
  const headers = {
    cookie,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  };
  const res = await axios.get("https://www.facebook.com/", { headers });
  const page = res.data;
  return {
    fb_dtsg: page.match(/"DTSGInitialData",\[],{"token":"([^"]+)"}/)?.[1],
    lsd: page.match(/"LSD",\[],{"token":"([^"]+)"}/)?.[1],
    jazoest: page.match(/name="jazoest" value="([^"]+)"/)?.[1],
    spin_r: page.match(/"__spin_r":([0-9]+)/)?.[1],
    spin_t: page.match(/"__spin_t":([0-9]+)/)?.[1],
    userId: cookie.match(/c_user=(\d+)/)?.[1]
  };
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
      return res.status(400).json({ error: "Missing required fields" });
    }

    const postId = extractPostIdFromUrl(postLink);
    if (!postId) return res.status(400).json({ error: "Invalid post link" });

    const cookie = buildCookieFromAppstate(appstate);
    const tokens = await extractTokens(cookie);
    if (!tokens.fb_dtsg) return res.status(500).json({ error: "Failed extracting fb_dtsg" });

    let success = 0, fail = 0;
    for (let i = 0; i < limit; i++) {
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
              feedback_id: postId,
              feedback_reaction: reactionType,
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
      } catch {
        fail++;
      }
    }
    return res.json({ reacted: success, failed: fail });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log("🚀 Server running at http://localhost:5000"));
