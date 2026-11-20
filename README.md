# Bili TV

Unofficial bilibili client for Samsung Tizen TVs (remote-control UI, plain JS, no framework).
Tested on a Samsung The Frame (QE55LS03FA, Tizen 6.x/7). Not affiliated with or endorsed by bilibili or Samsung.

## Features
Recommended / popular / history feeds, search, video details (multi-part), MSE playback (HEVC → H.264 → AV1, quality selectable),
progress sync, QR-code login (optional), voice search.

## Install
Use [Apps2Samsung](https://apps2samsung.com/): add this repository's GitHub release (`.wgt`) under Settings > Installing > Your sources,
or build it yourself: `python3 build.py` and install the unsigned wgt (A2S signs it with your own Samsung certificate).

## Remote keys
D-pad = move, OK = select, Back = exit. Player: left/right ±10 s, up = quality menu, down = progress bar, OK = play/pause.

## Development
```
node --test test/bili.test.mjs        # no dependencies, no browser
node dev/proxy.mjs &                  # local proxy; needs a throwaway account cookie in dev/.cookie
(cd app && python3 -m http.server 8099 --bind 127.0.0.1 &)
# open http://127.0.0.1:8099/index.html?dev=1&diag=0
```
Bilibili changes its API from time to time; endpoints and WBI signing live in `app/js/api.js`.

## License
MIT. Bundles blueimp-md5 (MIT) and qrcode-generator (MIT).
