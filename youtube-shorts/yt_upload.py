"""Upload a video to YouTube via the Data API v3 (stdlib only).

Reads credentials from env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.

  python3 yt_upload.py VIDEO.mp4 --title "..." [--description "..."] [--tags a,b]
                       [--privacy private|unlisted|public] [--publish-at 2026-10-20T15:00:00Z]
                       [--not-for-kids]
  python3 yt_upload.py --check        # verify credentials, print channel name
"""
import argparse, json, os, ssl, sys, urllib.parse, urllib.request

CA = "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=CA if os.path.exists(CA) else None)


def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=600) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} from {url.split('?')[0]}:\n{body}")


def access_token():
    missing = [k for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN") if not os.environ.get(k)]
    if missing:
        sys.exit("Missing environment variables: " + ", ".join(missing))
    body = urllib.parse.urlencode(dict(client_id=os.environ["YT_CLIENT_ID"],
                                       client_secret=os.environ["YT_CLIENT_SECRET"],
                                       refresh_token=os.environ["YT_REFRESH_TOKEN"],
                                       grant_type="refresh_token")).encode()
    _, _, out = req("https://oauth2.googleapis.com/token", body,
                    {"Content-Type": "application/x-www-form-urlencoded"})
    return json.loads(out)["access_token"]


def check(tok):
    _, _, out = req("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
                    headers={"Authorization": f"Bearer {tok}"})
    items = json.loads(out).get("items", [])
    if not items:
        sys.exit("Credentials work, but this Google account has no YouTube channel.")
    for c in items:
        s = c["statistics"]
        print(f"OK: channel '{c['snippet']['title']}' ({c['id']}), "
              f"{s.get('subscriberCount', '?')} subscribers, {s.get('videoCount', '?')} videos")


def upload(tok, a):
    status = {"privacyStatus": a.privacy, "selfDeclaredMadeForKids": not a.not_for_kids}
    if a.publish_at:
        status.update(privacyStatus="private", publishAt=a.publish_at)
    meta = {"snippet": {"title": a.title[:100], "description": a.description,
                        "tags": [t.strip() for t in a.tags.split(",") if t.strip()],
                        "categoryId": a.category},
            "status": status}
    size = os.path.getsize(a.video)
    _, hdrs, _ = req("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                     json.dumps(meta).encode(),
                     {"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                      "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)}, "POST")
    loc = hdrs.get("Location") or hdrs.get("location")
    with open(a.video, "rb") as f:
        _, _, out = req(loc, f.read(), {"Content-Type": "video/mp4", "Content-Length": str(size)}, "PUT")
    v = json.loads(out)
    print(f"Uploaded: https://youtube.com/shorts/{v['id']}  (privacy: {v['status']['privacyStatus']}"
          + (f", publishes {a.publish_at}" if a.publish_at else "") + ")")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("video", nargs="?")
    p.add_argument("--check", action="store_true")
    p.add_argument("--title")
    p.add_argument("--description", default="")
    p.add_argument("--tags", default="")
    p.add_argument("--category", default="24")  # 24 = Entertainment, 27 = Education
    p.add_argument("--privacy", default="private", choices=["private", "unlisted", "public"])
    p.add_argument("--publish-at")
    p.add_argument("--not-for-kids", action="store_true")
    a = p.parse_args()
    tok = access_token()
    if a.check or not a.video:
        check(tok)
    else:
        if not a.title:
            sys.exit("--title is required")
        upload(tok, a)
