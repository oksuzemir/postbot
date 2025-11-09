Run the admin-static render (two ways)

Host (uses local Chrome):

```bash
# Windows bash example (Git Bash / WSL-like):
export PUPPETE_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
# Run the convenience script which renders the sample template + admin static mapping
npm run render:admin-static
# Output: ./out/admin_static.png
```

Container (no local Chrome required — recommended for contributors):

```bash
# Build the image (first time)
docker compose build render-admin-static

# Run the one-off service; container has Chrome at /usr/bin/chrome
docker compose run --rm render-admin-static
# Output: ./out/admin_static.png (mounted from host)
```
