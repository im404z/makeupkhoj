# Website setup with PM2

Run these commands from the project root, where `ecosystem.config.js` lives. On this computer the root is `D:\laragon\www\makeupkhoj`.

The website listens on **port 7857**. PM2 runs one production Next.js server with automatic restart after a crash. File watching is disabled so crawler writes do not restart the website. This config starts only the website; existing crawler jobs remain separate.

## First setup

Use Node.js 22 or 24 LTS with npm. Install PM2 once on the server:

```sh
npm install --global pm2
npm --prefix website ci
```

Keep website settings in `website/.env.local`. Next.js loads them because the PM2 working directory is `website`. The root `.env` used by crawlers is not a substitute for this file. Preserve your existing credentials. On a new server, configure:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/makeupkhoj
MASTER_DB=makeupkhoj
NEXT_PUBLIC_SITE_URL=https://your-domain.com
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=your-strong-password
ADMIN_SESSION_SECRET=your-random-secret-at-least-32-characters-long
```

Use your actual database connection and domain. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep credentials out of the PM2 config and Git.

Build and start from the root:

```sh
npm --prefix website run build
pm2 start ecosystem.config.js
pm2 save
```

Open `http://localhost:7857`. On the same network use `http://SERVER-IP:7857` if your firewall permits it. A production build is required before starting. The explicit port argument ensures an inherited `PORT` value cannot switch this server to port 3000.

If an older server is still running on port 3000, stop that specific website process after verifying port 7857. Do not stop crawler processes or use `pm2 stop all`.

## Daily commands

```sh
pm2 status
pm2 logs makeupkhoj-web --lines 100
pm2 restart ecosystem.config.js --only makeupkhoj-web --update-env
pm2 stop makeupkhoj-web
pm2 start ecosystem.config.js --only makeupkhoj-web
```

PM2 stores logs in its user home directory, usually `~/.pm2/logs` on Linux or `%USERPROFILE%\.pm2\logs` on Windows. Use the same operating-system account for PM2 commands.

After changing website code or `NEXT_PUBLIC_SITE_URL`, rebuild. This sequence briefly takes the website offline and prevents the old process from serving a partially rebuilt `.next` folder:

```sh
pm2 stop makeupkhoj-web
npm --prefix website run build
# Continue only if the build succeeds.
pm2 restart ecosystem.config.js --only makeupkhoj-web --update-env
pm2 save
```

For runtime-only changes in `website/.env.local`, restart the website. Never put secrets in variables beginning with `NEXT_PUBLIC_`.

## Connect a domain

1. Point the domain's DNS A record to the server's public IP. Add an AAAA record only if the server supports IPv6. A private address such as `172.16.0.2` is not a public DNS destination.
2. Set `NEXT_PUBLIC_SITE_URL=https://your-domain.com` before building so canonical URLs and sitemaps use the domain.
3. Configure your web server to reverse proxy the domain to `http://127.0.0.1:7857`. DNS does not select an application port.
4. Install a TLS certificate for the domain and redirect HTTP to HTTPS. Let visitors use ports 80 and 443; restrict direct public access to 7857 when using the proxy.

For Nginx, this is the HTTP proxy server block before adding your TLS certificate configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:7857;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
```

Validate Nginx configuration before reloading it. If using Laragon Apache instead, enable `proxy` and `proxy_http`, preserve the original Host header, and configure the domain virtual host with `ProxyPass / http://127.0.0.1:7857/` and `ProxyPassReverse / http://127.0.0.1:7857/`. Set `X-Forwarded-Proto` to `https` in the TLS virtual host using `mod_headers`.

Choose one canonical hostname and redirect the other to it. Verify the homepage, `/products`, a product detail page, `/admin`, and `/sitemap.xml` through HTTPS after connecting the domain.

## Start after a server reboot

On Linux, run `pm2 startup`, execute the exact privileged command it prints, then run `pm2 save`. Do this as the same account that owns the website PM2 process.

On Windows, `pm2 startup` does not provide a native Windows boot service. Use Task Scheduler to run `pm2 resurrect` at startup under the same account. Use `where.exe pm2` to find the absolute `pm2.cmd` path, run it through `cmd.exe /c`, set the working directory to this project root, and select **Run whether user is logged on or not**. Save the PM2 process list with `pm2 save` first. Configure the task not to launch another instance if one is already running, then test a reboot.

## Troubleshooting

- **Port already in use:** inspect the process listening on 7857 before stopping anything. Do not start multiple website instances on the same port.
- **Production build missing:** run `npm --prefix website run build` successfully before starting PM2.
- **Wrong domain in metadata:** correct `NEXT_PUBLIC_SITE_URL`, rebuild, then restart.
- **Database or admin login unavailable:** verify `website/.env.local` and database access from the server, then inspect the website logs.
- **Frequent restarts:** inspect `pm2 logs makeupkhoj-web`; fix the error before restarting. PM2 limits rapid failed restarts to avoid an endless startup loop.

References: [PM2 application configuration](https://pm2.keymetrics.io/docs/usage/application-declaration/), [PM2 boot startup](https://pm2.keymetrics.io/docs/usage/startup/), [Next.js production CLI](https://nextjs.org/docs/app/api-reference/cli/next).
