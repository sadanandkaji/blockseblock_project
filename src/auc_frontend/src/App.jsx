import { useState, useEffect } from 'react';
import { Actor, HttpAgent } from '@dfinity/agent';
import './index.css';

// Import your canister's interface
import { idlFactory } from '../../declarations/auc_backend';
import { ConnectWallet, useAuth, useIdentity } from "@nfid/identitykit/react";
import { auc_backend } from "../../declarations/auc_backend";

function App() {
  // Use both useAuth and useIdentity hooks
  const { user, isConnecting, connect, disconnect } = useAuth();
  const identity = useIdentity();
  
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authenticatedActor, setAuthenticatedActor] = useState(null);

  // Form states
  const [newAuction, setNewAuction] = useState({
    title: '',
    description: '',
    duration: 3600,
    reservePrice: 100
  });

  const [bidForm, setBidForm] = useState({
    auctionId: '',
    amount: ''
  });

  // Calculate isConnected based on user
  const isConnected = !!user;

  // Fetch active auctions
  const fetchAuctions = async (actorToUse = null) => {
    try {
      setLoading(true);
      console.log("Starting fetchAuctions");
      
      // Create a fresh agent and actor for each request to avoid stale delegations
      const host = process.env.NODE_ENV === 'production' 
        ? "https://ic0.app" 
        : 'http://localhost:4943';
      
      const canisterId = process.env.CANISTER_ID_AUC_BACKEND || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
      
      // If logged in, create authenticated actor, otherwise create anonymous actor
      let agent;
      let actor;
      
      if (isConnected && identity) {
        console.log("Creating authenticated agent with identity");
        agent = new HttpAgent({ 
          identity,
          host,
          fetch: window.fetch.bind(window)
        });
        
        console.log("Agent created with identity:", !!agent);
      } else {
        console.log("Creating anonymous agent");
        agent = new HttpAgent({ 
          host,
          fetch: window.fetch.bind(window)
        });
        
        console.log("Anonymous agent created:", !!agent);
      }
      
      // For local development only
      if (process.env.NODE_ENV !== 'production') {
        console.log("Fetching root key for local development");
        await agent.fetchRootKey();
        console.log("Root key fetched");
      }
      
      // Create actor with this agent
      console.log("Creating actor with agent");
      actor = Actor.createActor(idlFactory, {
        agent,
        canisterId
      });
      
      console.log("Actor created:", !!actor);
      
      // Call getActiveAuctions on the actor
      console.log("Calling getActiveAuctions");
      const activeAuctions = await auc_backend.getActiveAuctions();
      console.log("getActiveAuctions call completed");
      console.log("Received auctions:", activeAuctions.length);
      
      setAuctions(activeAuctions);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching auctions:", error);
      setError("Failed to fetch auctions: " + error.message);
      setLoading(false);
    }
  };

  // Initial fetch of auctions when component mounts
  useEffect(() => {
    console.log("Component mounted - initial fetch of auctions");
    fetchAuctions();
  }, []);

  // Initialize actor when identity changes
  useEffect(() => {
    console.log("Authentication state changed - user:", !!user, "identity:", !!identity);
    
    if (user && identity) {
      console.log("Connected with principal:", user.principal.toText());
      console.log("Identity available:", !!identity);
      
      try {
        // Get the host based on environment
        const host = process.env.NODE_ENV === 'production' 
          ? "https://ic0.app" 
          : 'http://localhost:4943';
          
        console.log("Using host:", host);
        
        // Get canister ID
        const canisterId = process.env.CANISTER_ID_AUC_BACKEND || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
        console.log("Using canister ID:", canisterId);
        
        // Create an agent with the identity from useIdentity
        const agent = new HttpAgent({ 
          identity,
          host,
          fetch: window.fetch.bind(window)
        });
        
        console.log("Agent created successfully");
        
        // For local development only
        if (process.env.NODE_ENV !== 'production') {
          console.log("Fetching root key for local development");
          agent.fetchRootKey().catch(e => {
            console.error("Failed to fetch root key:", e);
          });
        }
        
        // Create a new actor with our authenticated agent
        const actor = Actor.createActor(idlFactory, {
          agent,
          canisterId
        });
        
        console.log("Created authenticated actor for canister calls");
        
        // Store the actor for later use
        setAuthenticatedActor(actor);
        
        // Fetch auctions with the new authentication
        fetchAuctions();
      } catch (err) {
        console.error("Error setting up agent:", err);
        setError("Authentication error: " + err.message);
      }
    } else {
      // Reset authenticated actor when user disconnects
      setAuthenticatedActor(null);
      
      if (!user) {
        console.log("User disconnected");
      } else if (!identity) {
        console.log("Identity not available");
      }
    }
  }, [user, identity]);

  // Handle form input change for new auction
  const handleAuctionFormChange = (e) => {
    const { name, value } = e.target;
    setNewAuction(prev => ({
      ...prev,
      [name]: name === 'duration' || name === 'reservePrice' ? Number(value) : value
    }));
  };

  // Create a new auction
  const createAuction = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      setError("Please connect your wallet first");
      return;
    }
    
    if (!authenticatedActor) {
      setError("Authentication not complete. Please reconnect your wallet.");
      return;
    }

    try {
      setLoading(true);
      const { title, description, duration, reservePrice } = newAuction;
      
      console.log("Creating auction with:", { title, description, duration, reservePrice });
      console.log("Using principal:", user.principal.toText());
      
      // Create the auction with our authenticated actor
      const auctionId = await authenticatedActor.createAuction(title, description, duration, reservePrice);
      console.log("Auction created with ID:", auctionId);
      
      // Reset form
      setNewAuction({
        title: '',
        description: '',
        duration: 3600,
        reservePrice: 100
      });
      
      // Fetch updated auctions
      await fetchAuctions();
      
      setLoading(false);
    } catch (error) {
      console.error("Error creating auction:", error);
      let errorMessage = "Failed to create auction";
      
      // Try to extract a more specific error message
      if (error.message) {
        errorMessage += ": " + error.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Handle bid form change
  const handleBidFormChange = (e) => {
    const { name, value } = e.target;
    setBidForm(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(value) : value
    }));
  };

  // Place a bid
const placeBid = async (e) => {
  e.preventDefault();
  
  if (!isConnected) {
    setError("Please connect your wallet first");
    return;
  }
  
  if (!identity) {
    setError("Identity not available. Please reconnect your wallet.");
    return;
  }

  try {
    setLoading(true);
    const { auctionId, amount } = bidForm;
    
    // Convert auctionId to a number if it's a string
    const id = typeof auctionId === 'string' ? Number(auctionId) : auctionId;
    
    console.log("Placing bid:", { auctionId: id, amount });
    
    // Create a fresh agent and actor for each bid request
    const host = process.env.NODE_ENV === 'production' 
      ? "https://ic0.app" 
      : 'http://localhost:4943';
    
    const canisterId = process.env.CANISTER_ID_AUC_BACKEND || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
    
    // Create fresh agent with current identity
    const agent = new HttpAgent({ 
      identity,
      host,
      fetch: window.fetch.bind(window)
    });
    
    // For local development only
    if (process.env.NODE_ENV !== 'production') {
      await agent.fetchRootKey();
    }
    
    // Create fresh actor with this agent
    const freshActor = Actor.createActor(idlFactory, {
      agent,
      canisterId
    });
    
    // Use the new actor instance for this specific call
    const result = await freshActor.placeBid(id, amount);
    console.log("Bid result:", result);
    
    if (result) {
      // Reset form
      setBidForm({
        auctionId: '',
        amount: ''
      });
      
      // Fetch updated auctions
      await fetchAuctions();
    } else {
      setError("Bid was not accepted. Please check auction status and bid amount.");
    }
    
    setLoading(false);
  } catch (error) {
    console.error("Error placing bid:", error);
    
    // More detailed error handling
    let errorMessage = "Failed to place bid";
    
    if (error.message && error.message.includes("Invalid delegation")) {
      errorMessage = "Your session has expired. Please reconnect your wallet and try again.";
      // Force disconnect to prompt for fresh connection
      try {
        await disconnect();
      } catch (e) {
        console.error("Error during disconnect:", e);
      }
    } else if (error.message) {
      errorMessage += ": " + error.message;
    }
    
    setError(errorMessage);
    setLoading(false);
  }
};

  // End an auction
  const endAuction = async (auctionId) => {
    if (!isConnected) {
      setError("Please connect your wallet first");
      return;
    }
    
    if (!authenticatedActor) {
      setError("Authentication not complete. Please reconnect your wallet.");
      return;
    }

    try {
      setLoading(true);
      console.log("Ending auction:", auctionId);
      
      const result = await authenticatedActor.endAuction(auctionId);
      console.log("End auction result:", result);
      
      if (result && result.length > 0) {
        alert(`Auction ended. Winner: ${result[0].winner.toText()}. Price: ${result[0].price}`);
      } else {
        alert("No winner for this auction.");
      }
      
      // Fetch updated auctions
      await fetchAuctions();
      
      setLoading(false);
    } catch (error) {
      console.error("Error ending auction:", error);
      setError("Failed to end auction: " + error.message);
      setLoading(false);
    }
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    // Convert nanoseconds to milliseconds
    const milliseconds = Number(timestamp) / 1_000_000;
    return new Date(milliseconds).toLocaleString();
  };

  // Check if user is the owner of an auction
  const isOwner = (auction) => {
    if (!user) return false;
    const userPrincipal = user.principal.toText();
    
    // Fixed the toText method call (was totext)
    try {
      const ownerPrincipal = auction.owner.toText();
      console.log("Comparing owner:", ownerPrincipal, "with current user:", userPrincipal);
      return ownerPrincipal === userPrincipal;
    } catch (error) {
      console.error("Error checking ownership:", error);
      return false;
    }
  };

  // Handle wallet connection error
  const handleConnectionError = () => {
    setError("There was an error connecting to the NFID wallet. Please make sure the NFID extension is installed correctly.");
  };

  // Manual connect function
  const handleManualConnect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Call the connect function from useAuth
      await connect();
      
      // Check if identity is available
      if (!identity && user) {
        console.warn("Connected with user but no identity is available. Check IdentityKitProvider setup.");
        setError("Connected, but identity is not available. Make sure IdentityKitProvider is configured correctly.");
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Manual connect failed:", error);
      setError("Connect failed: " + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Vickrey Auction Platform</h1>
        <div className="auth-info">
          {isConnected && (
            <div>
              <p>Logged in as: {user.principal.toText()}</p>
              <p>Identity available: {identity ? "Yes" : "No"}</p>
              <p>Actor initialized: {authenticatedActor ? "Yes" : "No"}</p>
            </div>
          )}
          <ConnectWallet onError={handleConnectionError} />
          
        </div>
      </header>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="content">
        <section className="create-auction">
          <h2>Create New Auction</h2>
          <form onSubmit={createAuction}>
            <div className="form-group">
              <label htmlFor="title">Title</label>
              <input
                type="text"
                id="title"
                name="title"
                value={newAuction.title}
                onChange={handleAuctionFormChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={newAuction.description}
                onChange={handleAuctionFormChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="duration">Duration (seconds)</label>
              <input
                type="number"
                id="duration"
                name="duration"
                min="60"
                value={newAuction.duration}
                onChange={handleAuctionFormChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reservePrice">Reserve Price</label>
              <input
                type="number"
                id="reservePrice"
                name="reservePrice"
                min="1"
                value={newAuction.reservePrice}
                onChange={handleAuctionFormChange}
                required
              />
            </div>
            
            <button type="submit" disabled={loading || !isConnected || !authenticatedActor}>
              {loading ? "Creating..." : !authenticatedActor ? "Authentication Required" : "Create Auction"}
            </button>
          </form>
        </section>

        <section className="place-bid">
          <h2>Place Bid</h2>
          <form onSubmit={placeBid}>
            <div className="form-group">
              <label htmlFor="auctionId">Auction ID</label>
              <input
                type="number"
                id="auctionId"
                name="auctionId"
                min="1"
                value={bidForm.auctionId}
                onChange={handleBidFormChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="amount">Bid Amount</label>
              <input
                type="number"
                id="amount"
                name="amount"
                min="1"
                value={bidForm.amount}
                onChange={handleBidFormChange}
                required
              />
            </div>
            
            <button type="submit" disabled={loading || !isConnected || !authenticatedActor}>
              {loading ? "Placing Bid..." : !authenticatedActor ? "Authentication Required" : "Place Bid"}
            </button>
          </form>
        </section>
      </div>

      <section className="auctions-list">
        <h2>Active Auctions</h2>
        <div className="auction-controls">
          <button onClick={() => fetchAuctions()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Auctions"}
          </button>
          <div className="auction-status">
            {isConnected ? (
              <span className="status-connected">Logged in: {user.principal.toText().substring(0, 10)}...</span>
            ) : (
              <span className="status-anonymous">Not logged in</span>
            )}
          </div>
        </div>
        
        {loading && !auctions.length ? (
          <p>Loading auctions...</p>
        ) : auctions.length === 0 ? (
          <p>No active auctions found.</p>
        ) : (
          <div className="auctions-grid">
            {auctions.map((auction) => (
              <div key={auction.id} className="auction-card">
                <h3>{auction.title}</h3>
                <p>{auction.description}</p>
                <div className="auction-details">
                  <p><strong>ID:</strong> {auction.id.toString()}</p>
                  <p><strong>Reserve Price:</strong> {auction.reservePrice.toString()}</p>
                  <p><strong>Starts:</strong> {formatDate(auction.startTime)}</p>
                  <p><strong>Ends:</strong> {formatDate(auction.endTime)}</p>
                  <p><strong>Status:</strong> {Object.keys(auction.state)[0]}</p>
                  <p><strong>Owner:</strong> {auction.owner.toText()}</p>
                </div>
                {isConnected && isOwner(auction) && (
                  <button 
                    onClick={() => endAuction(auction.id)}
                    disabled={loading || !authenticatedActor}
                  >
                    End Auction
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;