# GitHub Pages Deployment Guide

## Summary

Your landing page has been configured for GitHub Pages deployment with the following setup:

### What's Been Done:

1. **Created GitHub Actions Workflow** (`.github/workflows/pages.yml`)
   - Automatically deploys the `src/frontend/` folder when you push to main
   - Uses GitHub's official Pages deployment action

2. **Updated Links for Relative Paths**
   - Survey links changed from `/questionnaire` → `./questionnaire/`
   - This ensures proper navigation when deployed to subdirectories

3. **Directory Structure** (kept intact)
   ```
   src/frontend/
   ├── index.html          (landing page - 1700+ lines!)
   ├── questionnaire/
   │   └── index.html      (survey)
   └── static/
       ├── style.css
       ├── Logo.jpg
       └── New_Jersey_IT_logo.svg
   ```

## Deployment Steps

### Step 1: Push Changes to GitHub

```bash
git add .
git commit -m "Add GitHub Actions deployment workflow"
git push origin main
```

### Step 2: Enable GitHub Pages

1. Go to your repository: `https://github.com/giovannettif/ConstructionSurvey`
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Build and deployment**:
   - Source: **GitHub Actions**
   - (The workflow file handles the rest!)

4. Click **Save**

### Step 3: Access Your Site

Once deployed (takes ~2-3 minutes), your site will be at:

**https://giovannettif.github.io/ConstructionSurvey/**

This will serve the `src/frontend/` folder as the root.

### URLs:
- **Landing Page**: `https://giovannettif.github.io/ConstructionSurvey/`
- **Survey**: `https://giovannettif.github.io/ConstructionSurvey/questionnaire/`

## Features Deployed:

✅ **5 Tab Sections**: Home, About Us, Order Materials, Blog, Contact  
✅ **Modern Tab Navigation**: Sliding indicator animation  
✅ **Meet the Team**: 4 team members with PID Lab photos  
✅ **Responsive Design**: Mobile hamburger menu  
✅ **Working Survey**: Links properly to questionnaire  
✅ **Newsletter Form**: Email signup  
✅ **Contact Form**: Message submission  
✅ **Modern Background**: Gradient mesh + diagonal accents  

## Monitoring Deployment:

1. Go to **Actions** tab in your GitHub repo
2. Watch the "Deploy to GitHub Pages" workflow run
3. Green checkmark = Success!
4. Red X = Check the logs for errors

## Troubleshooting:

- **404 errors?** Wait 2-3 minutes after deployment for cache to clear
- **Images not loading?** Check browser console (F12) for 404 errors
- **Styles broken?** Ensure `static/style.css` is in the correct path

## Need to Push?

If you have push access issues, you can provide credentials via:

```bash
# Option 1: Use GitHub CLI
git remote set-url origin https://giovannettif:YOUR_TOKEN@github.com/giovannettif/ConstructionSurvey.git

# Option 2: Configure HTTPS with stored credentials
git config --global credential.helper store
```

Or share your token/username and I can help configure it.
