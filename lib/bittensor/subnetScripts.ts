import { app } from "electron";

const path = require('path');
const fs = require('fs');

export const downloadSubnetScripts = (filename) => {
    try {
        // Construct the full, absolute path to the script
        // app.getAppPath() is the root of your application package
        const scriptPath = path.join(app.getAppPath(), 'public/scripts', filename);
        // Read the file content synchronously (or asynchronously if preferred)
        const content = fs.readFileSync(scriptPath, 'utf8');
        return { success: true, content: content };
    } catch (error:any) {
        console.error(`Failed to read script file ${filename}:`, error);
        return { success: false, error: error.message };
    }
}