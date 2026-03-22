# Web Server Packaging and Deployment

This guide packages the current repository into a Linux server release archive
that contains:

- the web app static files from `packages/app/dist`
- the OpenCode backend binary from `packages/opencode/dist`
- a generated env template
- startup and health-check scripts

## Assumptions

- The build machine already has dependencies installed with `bun install`
- The build machine can run Bun `1.3.10` or newer
- The target server is Linux
- The recommended target is `linux-x64`
- The production site is deployed on one origin
  - the frontend static files and the backend API should be served behind the
    same domain

## 1. Build the release archive locally

From the repository root:

```bash
bun run deploy:pack:web
```

The default target is `linux-x64`.

To build another Linux target, set `OPENCODE_DEPLOY_TARGET` first:

```bash
OPENCODE_DEPLOY_TARGET=linux-arm64 bun run deploy:pack:web
OPENCODE_DEPLOY_TARGET=linux-x64-musl bun run deploy:pack:web
```

After the script finishes, the output is written to:

```bash
.output/releases/
```

You will get:

- a staged directory such as `opencode-web-linux-x64-1.2.27-c9c873499/`
- a compressed archive with the same name and a `.tar.gz` suffix

## 2. Upload the archive to the server

Example:

```bash
scp .output/releases/opencode-web-linux-x64-1.2.27-c9c873499.tar.gz user@your-server:/opt/opencode/
```

## 3. Extract the archive on the server

SSH into the server and run:

```bash
cd /opt/opencode
tar -xzf opencode-web-linux-x64-1.2.27-c9c873499.tar.gz
cd opencode-web-linux-x64-1.2.27-c9c873499
```

The extracted directory contains:

- `app/` - static frontend files
- `server/bin/opencode` - backend binary
- `env/server.env.example` - env template
- `bin/start-server.sh` - backend start script
- `bin/check-health.sh` - backend health-check script
- `README.md` - short runtime notes

## 4. Prepare the backend env file

Copy the template:

```bash
cp env/server.env.example env/server.env
```

Edit `env/server.env` and set at least:

```bash
OPENCODE_SERVER_PASSWORD=change-me
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_HOSTNAME=127.0.0.1
OPENCODE_SERVER_PORT=4096
OPENCODE_SERVER_CORS=https://your-domain.example.com
```

Recommended behavior:

- Keep `OPENCODE_SERVER_HOSTNAME=127.0.0.1`
- Expose the backend through Nginx instead of binding it directly to the public
  network
- Set a real `OPENCODE_SERVER_PASSWORD`

## 5. Start the backend

From the extracted release directory:

```bash
./bin/start-server.sh
```

The script loads `env/server.env` and starts:

```bash
./server/bin/opencode serve --hostname ... --port ... --cors ...
```

If you want to use another env file:

```bash
./bin/start-server.sh /path/to/server.env
```

## 6. Verify the backend

On the server:

```bash
./bin/check-health.sh
```

You should get a response like:

```json
{"healthy":true,"version":"..."}
```

You can also check manually:

```bash
curl -fsS http://127.0.0.1:4096/global/health
```

## 7. Serve the frontend on the same origin

The production web app uses `location.origin` as its default backend URL.
That means the static site and the backend API should sit behind the same
domain.

Recommended topology:

- Nginx listens on `443`
- Nginx serves the extracted `app/` directory
- Nginx proxies OpenCode API and websocket routes to `127.0.0.1:4096`

Example Nginx config:

```nginx
server {
  listen 80;
  server_name your-domain.example.com;

  root /opt/opencode/opencode-web-linux-x64-1.2.27-c9c873499/app;
  index index.html;

  location /assets/ {
    try_files $uri =404;
  }

  location = /favicon.ico { try_files $uri =404; }
  location = /favicon.svg { try_files $uri =404; }

  location ~ ^/(auth|config|experimental|global|instance|mcp|permission|project|provider|pty|question|session|tui)/ {
    proxy_pass http://127.0.0.1:4096;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
  }

  location /doc {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /find {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /file {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /file/content {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /file/status {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /find/file {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location = /find/symbol {
    proxy_pass http://127.0.0.1:4096;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

If your Nginx setup requires a map for websocket upgrade, add this once in the
`http` block:

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}
```

## 8. Recommended process management

For long-running deployment, run `./bin/start-server.sh` under a supervisor such
as:

- `systemd`
- `supervisord`
- `pm2`

The generated scripts in the release archive are intentionally simple. They are
meant to be called by your process manager, not kept in a foreground SSH
session.

## 9. Updating later

For a later update:

1. Re-run `bun run deploy:pack:web` locally
2. Upload the new archive
3. Extract it into a new release directory
4. Copy or recreate `env/server.env`
5. Restart the backend process with the new release path
6. Point Nginx or your release symlink to the new `app/` directory if needed
