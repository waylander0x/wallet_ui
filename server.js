import express from 'express';
import numbro from 'numbro';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();
const SIM_API_KEY = process.env.SIM_API_KEY;

if (!SIM_API_KEY) {
    console.error("FATAL ERROR: SIM_API_KEY is not set in your environment variables.");
    process.exit(1);
}

// Set up __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();

// Configure Express settings
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// get Wallet Balances
async function getWalletBalances(walletAddress) {
    if (!walletAddress) return []; // Return empty if no address

    // Construct the query parameters
    // metadata=url,logo fetches token URLs and logo images
    // exclude_spam_tokens=true filters out known spam tokens
    const queryParams = `metadata=url,logo&exclude_spam_tokens=true`;

    const url = `https://api.sim.dune.com/v1/evm/balances/${walletAddress}?${queryParams}`;

    try {
        const response = await fetch(url, {
            headers: {
                'X-Sim-Api-Key': SIM_API_KEY, // Your API key from .env
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API request failed with status ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = await response.json();

        // The API returns JSON with a "balances" key. We return that directly.
        return data.balances;

    } catch (error) {
        console.error("Error fetching wallet balances:", error.message);
        return []; // Return empty array on error
    }
}

// Add our home route
app.get('/', async (req, res) => {
    const { 
        walletAddress = '',
        tab = 'tokens'
    } = req.query;

    let tokens = [];
    let totalWalletUSDValue = 0; // Will be updated
    let errorMessage = null;

    if (walletAddress) {
        try {
            tokens = await getWalletBalances(walletAddress);

            // Calculate the total USD value from the fetched tokens
            if (tokens && tokens.length > 0) {
                tokens.forEach(token => {
                    let individualValue = parseFloat(token.value_usd);
                    if (!isNaN(individualValue)) {
                        totalWalletUSDValue += individualValue;
                    }
                });
            }
            
            totalWalletUSDValue = numbro(totalWalletUSDValue).format('$0,0.00');

        } catch (error) {
            console.error("Error in route handler:", error);
            errorMessage = "Failed to fetch wallet data. Please try again.";
            // tokens will remain empty, totalWalletUSDValue will be 0
        }
    }

    res.render('wallet', {
        walletAddress: walletAddress,
        currentTab: tab,
        totalWalletUSDValue: totalWalletUSDValue, // Pass the calculated total
        tokens: tokens,
        activities: [], // Placeholder for Guide 2
        collectibles: [], // Placeholder for Guide 3
        errorMessage: errorMessage
    });
});

// Start the server
app.listen(3001, () => {
    console.log(`Server running at http://localhost:3001`);
});