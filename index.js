const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

async function convertCookie(appstate) {
  try {
    const cookies = typeof appstate === "string" ? JSON.parse(appstate) : appstate;
    return cookies.map(c => `${c.key}=${c.value}`).join("; ");
  } catch {
    throw new Error("❌ Invalid appstate format");
  }
}

async function extractTokens(cookie) {
  const headers = {
    cookie,
    "user-agent": "Mozilla/5.0"
  };

  const res = await axios.get("https://mbasic.facebook.com/", { headers });
  const html = res.data;

  const fb_dtsg = html.match(/name="fb_dtsg" value="(.*?)"/)?.[1];
  const jazoest = html.match(/name="jazoest" value="(\d+)"/)?.[1];
  const userId = cookie.match(/c_user=(\d+)/)?.[1];

  if (!fb_dtsg || !jazoest || !userId) {
    throw new Error("❌ Failed to extract fb_dtsg / jazoest / userId");
  }

  return { fb_dtsg, jazoest, userId };
}

function extractPostId(url) {
  return url.match(/story_fbid=(\d+)/)?.[1] ||
         url.match(/\/posts\/(\d+)/)?.[1] ||
         url.match(/\/videos\/(\d+)/)?.[1] ||
         url.match(/\/(\d{6,})(?:\/|\?|$)/)?.[1];
}

app.post("/react", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit = 1 } = req.body;

    if (!appstate || !postLink || !reactionType) {
      return res.status(400).json({ error: "❌ Missing fields" });
    }

    const cookie = await convertCookie(appstate);
    const tokens = await extractTokens(cookie);

    const postId = extractPostId(postLink);
    if (!postId) throw new Error("❌ Invalid post link");

    let success = 0, fail = 0;

    for (let i = 0; i < limit; i++) {
      try {
        const form = new URLSearchParams({
          av: tokens.userId,
          __user: tokens.userId,
          fb_dtsg: tokens.fb_dtsg,
          jazoest: tokens.jazoest,
          __spin_r: "0",
          __spin_b: "trunk",
          __spin_t: "0",
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
            "user-agent": "Mozilla/5.0"
          }
        });

        success++;
      } catch (err) {
        fail++;
      }
    }

    res.json({ reacted: success, failed: fail, account: tokens.userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 React Boost API running on http://localhost:${PORT}`));
