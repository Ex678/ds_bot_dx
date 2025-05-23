const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios'); // For fetching PFP images

// Attempt to register a common font. This might need adjustment based on server environment.
// If an error occurs, it will fall back to canvas's default font.
try {
  // Example: registerFont(path.join(__dirname, '..', 'assets', 'fonts', 'YourFont.ttf'), { family: 'CustomFont' });
  // For now, we'll rely on system fonts or canvas defaults if specific fonts aren't bundled.
  // registerFont('arial.ttf', { family: 'Arial' }); // This would require the font file
} catch (fontError) {
  console.warn("[Image Generator] Could not register custom font. Using system/default fonts.", fontError.message);
}

// Helper function to fetch an image and return it as a canvas Image object
async function fetchCanvasImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return loadImage(Buffer.from(response.data));
  } catch (error) {
    console.error(`[Image Generator] Error fetching image from URL ${url}:`, error.message);
    return null; // Return null if image fetching fails
  }
}

// Helper function to draw text with potential truncation
function drawText(ctx, text, x, y, maxWidth, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth); // `fillText` has built-in maxWidth in modern canvas
}

// Helper function to draw text and handle potential truncation with "..."
function drawTruncatedText(ctx, text, x, y, maxWidth, font, color) {
    ctx.font = font;
    ctx.fillStyle = color;
    let truncatedText = text;
    if (ctx.measureText(text).width > maxWidth) {
        while (ctx.measureText(truncatedText + '...').width > maxWidth && truncatedText.length > 0) {
            truncatedText = truncatedText.slice(0, -1);
        }
        truncatedText += '...';
    }
    ctx.fillText(truncatedText, x, y);
}


async function generateLeaderboardImage(topUsersData) {
  // --- Configuration ---
  const canvasWidth = 800;
  const headerHeight = 80;
  const userRowHeight = 70;
  const padding = 20;
  const pfpSize = 50;
  const canvasHeight = headerHeight + (userRowHeight * topUsersData.length) + padding;

  const backgroundColor = '#2C2F33';
  const headerColor = '#FFFFFF';
  const rankColor = '#B0B0B0'; // Light grey for rank
  const usernameColor = '#FFFFFF';
  const levelColor = '#88DDFF'; // Light blue for level
  const xpColor = '#A0A0A0';    // Lighter grey for XP

  const headerFont = 'bold 36px Arial'; // Using common system font
  const rankFont = '24px Arial';
  const usernameFont = 'bold 26px Arial';
  const levelFont = '22px Arial';
  const xpFont = '18px Arial';

  // --- Canvas Setup ---
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // --- Header ---
  ctx.textAlign = 'center';
  drawText(ctx, '🏆 Clasificación del Servidor', canvasWidth / 2, headerHeight / 2 + 15, canvasWidth - padding*2, headerFont, headerColor);

  // --- User Rows ---
  ctx.textAlign = 'left'; // Reset alignment for user rows
  for (let i = 0; i < topUsersData.length; i++) {
    const userData = topUsersData[i];
    const yPos = headerHeight + (i * userRowHeight);

    // Rank
    drawText(ctx, `#${i + 1}`, padding, yPos + userRowHeight / 2 + 8, 50, rankFont, rankColor);

    // PFP
    const pfpX = padding + 50; // Adjusted X for rank
    const pfpY = yPos + (userRowHeight - pfpSize) / 2;
    if (userData.avatarURL) { // userData should have an avatarURL field
      const pfpImage = await fetchCanvasImage(userData.avatarURL);
      if (pfpImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pfpX + pfpSize / 2, pfpY + pfpSize / 2, pfpSize / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(pfpImage, pfpX, pfpY, pfpSize, pfpSize);
        ctx.restore();
      } else {
        // Draw a placeholder if PFP fails to load
        ctx.fillStyle = '#404040'; // Dark grey placeholder
        ctx.fillRect(pfpX, pfpY, pfpSize, pfpSize);
        ctx.font = 'bold 20px Arial'; // Font for placeholder '?'
        ctx.fillStyle = '#FFFFFF';    // White '?'
        ctx.textAlign = 'center';     // Center '?' in the box
        ctx.fillText('?', pfpX + pfpSize / 2, pfpY + pfpSize / 2 + 7); // Adjusted Y for '?'
        ctx.textAlign = 'left';       // Reset alignment
      }
    } else {
        // Draw a placeholder if no avatar URL
        ctx.fillStyle = '#404040';
        ctx.fillRect(pfpX, pfpY, pfpSize, pfpSize);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('?', pfpX + pfpSize / 2, pfpY + pfpSize / 2 + 7);
        ctx.textAlign = 'left';
    }


    // Username, Level, XP
    const textX = pfpX + pfpSize + 15;
    const usernameMaxWidth = canvasWidth - textX - padding - 150; // Reserve space for level/XP
    
    // Username (ensure userData has a 'username' field)
    drawTruncatedText(ctx, userData.username || 'Usuario Desconocido', textX, yPos + userRowHeight / 2 - 5, usernameMaxWidth, usernameFont, usernameColor);
    
    // Level
    const levelText = `Nivel: ${userData.level}`;
    ctx.font = levelFont; // Set font before measuring
    const levelTextMetrics = ctx.measureText(levelText);
    const levelTextWidth = levelTextMetrics.width;
    drawText(ctx, levelText, textX, yPos + userRowHeight / 2 + 20, 150, levelFont, levelColor); // Max width for level text

    // XP
    const xpText = `(XP: ${userData.xp})`;
    // Max width for XP can be, for example, canvasWidth - (textX + levelTextWidth + 10) - padding
    const maxXpWidth = canvasWidth - (textX + levelTextWidth + 10 + padding); 
    drawText(ctx, xpText, textX + levelTextWidth + 10 , yPos + userRowHeight / 2 + 20, maxXpWidth > 0 ? maxXpWidth : 50, xpFont, xpColor);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardImage };
