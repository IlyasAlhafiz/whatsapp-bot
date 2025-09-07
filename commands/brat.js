import fs from "fs";
import sharp from "sharp";
import { writeFile } from "fs/promises";

async function createTextSticker(text, outputPath) {
    const width = 200;
    const height = 200;

    let words = text.split(" ");
    let lines = [];
    let currentLine = "";

    const maxWidth = width * 0.8;  // Use 80% of the width for the text

    // Create a temporary SVG to measure text width
    const measureSvg = (fontSize, text) => `
        <svg xmlns="http://www.w3.org/2000/svg">
            <text font-size="${fontSize}" font-family="Arial">${text}</text>
        </svg>
    `;

    const measureTextWidth = async (fontSize, text) => {
        const tempSvgPath = "temp_measure.svg";
        await writeFile(tempSvgPath, measureSvg(fontSize, text));
        const metadata = await sharp(tempSvgPath).metadata();
        fs.unlinkSync(tempSvgPath);
        return metadata.width;
    };

    // Find the optimal font size
    let fontSize = 100;
    let currentWidth = Infinity;
    while (currentWidth > maxWidth && fontSize > 10) {
        fontSize -= 5;
        currentWidth = await measureTextWidth(fontSize, text);
    }

    const lineSpacing = 1.2;
    let initialY = height / 2 - ((lines.length - 1) * fontSize * lineSpacing / 2);

    let textElements = words.map((word, index) => {
        return `<tspan x="50%" y="${initialY + index * fontSize * lineSpacing}" text-anchor="middle">${word}</tspan>`;
    }).join(" ");

    const svgImage = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="white"/>
            <text font-size="${fontSize}" fill="black" font-family="Arial" text-anchor="middle" dominant-baseline="middle">
                ${textElements}
            </text>
        </svg>
    `;

    await writeFile("text.svg", svgImage);

    await sharp("text.svg")
        .resize(width, height)
        .toFormat("webp")
        .toFile(outputPath);

    fs.unlinkSync("text.svg");
}

async function sendTextSticker(sock, sender, text) {
    const outputPath = "sticker.webp";
    await createTextSticker(text, outputPath);
    await sock.sendMessage(sender, {
        sticker: fs.readFileSync(outputPath),
    });
    fs.unlinkSync(outputPath);
}

export { sendTextSticker };
