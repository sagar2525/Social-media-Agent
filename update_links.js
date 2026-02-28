const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(
    /<a href="#" class="brand-social-link brand-x"/,
    '<a href="#" id="brandLinkX" class="brand-social-link brand-x"'
);
html = html.replace(
    /<a href="#" class="brand-social-link brand-ln"/,
    '<a href="#" id="brandLinkLn" class="brand-social-link brand-ln"'
);
html = html.replace(
    /<a href="#" class="brand-social-link brand-dc" target="_blank" title="Discord">[\s\S]*?<\/a>/,
    `<a href="#" id="brandLinkIg" class="brand-social-link brand-ig" target="_blank" title="Instagram">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C16.67.014 16.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                    </svg>
                </a>`
);
html = html.replace(
    /<a href="#" class="brand-social-link brand-yt"/,
    '<a href="#" id="brandLinkYt" class="brand-social-link brand-yt"'
);
fs.writeFileSync('index.html', html);

// 2. Update style.css
let css = fs.readFileSync('style.css', 'utf8');
css = css.replace('.brand-dc {', '.brand-ig {');
css = css.replace('background: #5865F2;', 'background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%);');
fs.writeFileSync('style.css', css);

// 3. Update script.js
let js = fs.readFileSync('script.js', 'utf8');
const scriptReplacement = `async function loadSocialLinks() {
    try {
        const res = await fetch('/data.json');
        if (res.ok) {
            socialLinks = await res.json();
            
            // Map the brand header social icons correctly
            const mapLink = (id, key) => {
                const el = document.getElementById(id);
                if (el && socialLinks[key]) {
                    let url = socialLinks[key];
                    if (!url.startsWith('http')) url = 'https://' + url;
                    el.href = url;
                } else if (el) {
                    el.style.display = 'none'; // hide if not in data.json
                }
            };
            
            mapLink('brandLinkX', 'X');
            mapLink('brandLinkLn', 'Linkedin');
            mapLink('brandLinkIg', 'Instagram');
            mapLink('brandLinkYt', 'youtube'); 
        }
    } catch (e) { console.warn('Could not load social links:', e); }
}`;

js = js.replace(/async function loadSocialLinks\(\)\s*{[\s\S]*?}/, scriptReplacement);
fs.writeFileSync('script.js', js);

console.log('Update script completed.');
