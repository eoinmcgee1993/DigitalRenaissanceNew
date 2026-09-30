# Digital Renaissance

The website at https://digital-renaissance.tech: plain HTML, no build step.

- `site/` is what gets published: `index.html`, `products.html` (`/products`),
  `blog.html` (`/blog`), plus `notes/` and `money-machine/`.
- `money-machine/` holds the tests and 3D-model build for the Money Machine
  page in `site/money-machine/`: `npm test` from inside that folder.
- `supabase/`, `CONTENT_OS.md` and `EDITORIAL_SYSTEM.md` are the content
  pipeline notes and schema.

Deploys go to the Netlify project `digitalrenaissancearchitect`. `netlify.toml`
publishes `site/`, so linking this repo to that project deploys it on every push
to `main`.
