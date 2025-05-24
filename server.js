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
                'X-Sim-Api-Key': SIM_API_KEY, // my api key
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API request failed with status ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Return formatted values and amounts
        return (data.balances || []).map(token => {
            // 1. Calculate human-readable token amount
            const numericAmount = parseFloat(token.amount) / Math.pow(10, parseInt(token.decimals));
            // 2. Get numeric USD value
            const numericValueUSD = parseFloat(token.value_usd);
            // 3. Format using numbro
            const valueUSDFormatted = numbro(numericValueUSD).format('$0,0.00');
            const amountFormatted = numbro(numericAmount).format('0,0.[00]A');

            return {
                ...token,
                valueUSDFormatted,
                amountFormatted
            };
        }).filter(token => token.symbol !== 'RTFKT'); // Removing Spam Tokens. 

    } catch (error) {
        console.error("Error fetching wallet balances:", error.message);
        return []; // Return empty array on error
    }
}
async function getWalletActivity(walletAddress, limit = 25) { // Default to fetching 25 activities
    if (!walletAddress) return [];

    // The Activity API is currently in beta.
    // We add a 'limit' query parameter to control how many activities are returned.
    const url = `https://api.sim.dune.com/v1/evm/activity/${walletAddress}?limit=${limit}`;

    try {
        const response = await fetch(url, {
            headers: {
                'X-Sim-Api-Key': SIM_API_KEY, //
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Activity API request failed with status ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`Activity API request failed: ${response.statusText}`);
        }

        const data = await response.json();
        // The API returns activity items in the 'activity' key of the JSON response.
        return data.activity || []; 
    } catch (error) {
        console.error("Error fetching wallet activity:", error.message);
        return []; // Return empty array on error
    }
}

async function getWalletCollectibles(walletAddress, limit = 50) { // Default to fetching up to 50 collectibles
    if (!walletAddress) return [];

    const url = `https://api.sim.dune.com/v1/evm/collectibles/${walletAddress}?limit=${limit}`;

    try {
        const response = await fetch(url, {
            headers: {
                'X-Sim-Api-Key': SIM_API_KEY, // Your API key from .env
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Collectibles API request failed with status ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`Collectibles API request failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.collectibles || []; 
    } catch (error) {
        console.error("Error fetching wallet collectibles:", error.message);
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
    let activities = [];
    let collectibles = []; // Initialize collectibles array
    let totalWalletUSDValue = 0;
    let errorMessage = null;

    if (walletAddress) {
        try {
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
            // Fetch balances, activities, and collectibles concurrently for better performance
            [tokens, activities, collectibles] = await Promise.all([
                getWalletBalances(walletAddress),
                getWalletActivity(walletAddress, 25), // Fetching 25 recent activities
                getWalletCollectibles(walletAddress, 50) // Fetching up to 50 collectibles
            ]);

            // Calculate total portfolio value from token balances (Guide 1)
            if (tokens && tokens.length > 0) {
                totalWalletUSDValue = tokens.reduce((sum, token) => {
                    const value = parseFloat(token.value_usd);
                    return sum + (isNaN(value) ? 0 : value);
                }, 0);
            }
        } catch (error) {
            console.error("Error in route handler fetching all data:", error);
            errorMessage = "Failed to fetch wallet data. Please try again.";
        }
    }
    
    res.render('wallet', {
        walletAddress: walletAddress,
        currentTab: tab,
        totalWalletUSDValue: `$${totalWalletUSDValue.toFixed(2)}`,
        tokens: tokens,
        activities: activities,
        collectibles: collectibles, // Pass collectibles to the template
        errorMessage: errorMessage
    });
});

// Start the server
app.listen(3001, () => {
    console.log(`Server running at http://localhost:3001`);
});