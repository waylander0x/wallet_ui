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
    if (!walletAddress) return []; 

    const queryParams = `metadata=url,logo&exclude_spam_tokens=true`;
    const url = `https://api.sim.dune.com/v1/evm/balances/${walletAddress}?${queryParams}`;

    try {
        const response = await fetch(url, {
            headers: {
                'X-Sim-Api-Key': SIM_API_KEY,
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
        }).filter(token => token.symbol !== 'RTFKT'); // Removing Spam Tokens. Add more if you like.

    } catch (error) {
        console.error("Error fetching wallet balances:", error.message);
        return []; 
    }
}

// Add our home route
app.get('/', async (req, res) => {
    const { 
        walletAddress = '',
        tab = 'tokens'
    } = req.query;

    let tokens = [];
    let totalWalletUSDValue = 0;
    let errorMessage = null;

    if (walletAddress) {
        try {
            tokens = await getWalletBalances(walletAddress);
        } catch (error) {
            console.error("Error in route handler:", error);
            errorMessage = "Failed to fetch wallet data. Please try again.";
            // tokens will remain empty, totalWalletUSDValue will be 0
        }
    }

    res.render('wallet', {
        walletAddress: walletAddress,
        currentTab: tab,
        totalWalletUSDValue: `$0.00`, // We'll calculate this in the next section
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