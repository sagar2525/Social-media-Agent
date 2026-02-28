const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const targetStr = `                <span class="credit-badge" id="creditBadge">3 posts left</span>\r\n                <div class="header-right">`;
const targetStr2 = `                <span class="credit-badge" id="creditBadge">3 posts left</span>\n                <div class="header-right">`;

const replaceStr = `                <div class="header-right">\n                    <span class="credit-badge" id="creditBadge" style="margin-right: 8px;">3 posts left</span>`;

if (html.includes(targetStr)) {
    html = html.replace(targetStr, replaceStr.replace(/\n/g, '\r\n'));
} else if (html.includes(targetStr2)) {
    html = html.replace(targetStr2, replaceStr);
}

fs.writeFileSync('index.html', html);
console.log('Update Complete 5');
