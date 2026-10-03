# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/5178b6a2-8d53-4275-a376-67022407be64

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/5178b6a2-8d53-4275-a376-67022407be64) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/5178b6a2-8d53-4275-a376-67022407be64) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Cloudflare Workers deployment

This Vite/React app is deployed as static assets using `wrangler.jsonc`.
Cloudflare serves `dist` and routes navigation requests back to `index.html`, including direct links to the admin and other app pages.

Connect this repository in Cloudflare **Workers & Pages → Create application → Import a repository**, using the same account as Al-Islaam.

| Setting | Value |
| --- | --- |
| Repository | `Tabid123/awdheegle-data-sax` |
| Worker name | `awdheegle-data-sax` |
| Production branch | `cloudflare-production` |
| Root directory | Repository root |
| Build command | `bun run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Preview builds | Enabled |

`main` remains the Lovable/development branch. Once the repository is connected, changes to `main` create previews. Publish tested changes by merging `main` into `cloudflare-production`; pushes to that branch update the live Worker.

The initial configuration and production branch are prepared in GitHub. The site becomes live only after Cloudflare imports the repository and its first production build succeeds.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).
