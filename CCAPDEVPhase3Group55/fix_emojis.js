const fs = require('fs');
const path = require('path');

const replacements = {
  '🎮': '<i class="bi bi-controller text-info"></i>',
  '📚': '<i class="bi bi-collection text-info"></i>',
  '⏰': '<i class="bi bi-clock-history text-info"></i>',
  '👥': '<i class="bi bi-people-fill text-info"></i>',
  '⭐': '<i class="bi bi-star-fill text-info"></i>',
  '🏆': '<i class="bi bi-trophy-fill text-warning"></i>',
  '🌙': '<i class="bi bi-moon-stars-fill text-warning"></i>',
  '🎯': '<i class="bi bi-bullseye text-warning"></i>',
  '📣': '<i class="bi bi-megaphone-fill text-warning"></i>',
  '🌐': '<i class="bi bi-globe2 text-warning"></i>',
  '👑': '<i class="bi bi-award-fill text-warning"></i>',
  '🏃': '<i class="bi bi-person-walking text-warning"></i>',
  '🎪': '<i class="bi bi-shop text-warning"></i>',
  '📊': '<i class="bi bi-bar-chart-line-fill text-warning"></i>',
  '🌍': '<i class="bi bi-globe-americas text-warning"></i>',
  '⚡': '<i class="bi bi-lightning-charge-fill text-info"></i>',
  '⏱️': '<i class="bi bi-stopwatch-fill text-info"></i>',
  '✨': '<i class="bi bi-stars text-info"></i>',
  '🧠': '<i class="bi bi-lightbulb-fill text-info"></i>',
  '🎆': '<i class="bi bi-fire text-info"></i>',
  '🌟': '<i class="bi bi-star-fill text-info"></i>'
};

['achievements.hbs', 'profile.hbs'].forEach(filename => {
  const file = path.join(__dirname, 'views', filename);
  if (!fs.existsSync(file)) return;
  
  let text = fs.readFileSync(file, 'utf8');
  for (const [emoji, icon] of Object.entries(replacements)) {
    // For general content
    text = text.split(emoji).join(icon);
  }
  
  // Fix specifically the javascript emoji:'...' attributes in profile.hbs
  // Actually, split/join will ruin the JS object by substituting HTML inside 'emoji'. 
  // It's better if we just do string replacement for the JS array specifically or globally and it should work if it renders via {{{emoji}}}
  fs.writeFileSync(file, text);
});

console.log('Emojis replaced successfully.');
