import Time "mo:base/Time";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Principal "mo:base/Principal";
import Option "mo:base/Option";
import Debug "mo:base/Debug";
import Order "mo:base/Order";
import Hash "mo:base/Hash";
import Result "mo:base/Result";

actor VickreyAuction {
  // Type definitions
  type AuctionId = Nat;
  type Bid = {
    bidder : Principal;
    amount : Nat;
    timestamp : Time.Time;
  };

  type AuctionState = {
    #Active;
    #Ended;
    #Cancelled;
  };

  type Auction = {
    id : AuctionId;
    owner : Principal;
    title : Text;
    description : Text;
    startTime : Time.Time;
    endTime : Time.Time;
    reservePrice : Nat;
    state : AuctionState;
  };

  // State variables
  private stable var nextAuctionId : AuctionId = 1;
  private var auctions = HashMap.HashMap<AuctionId, Auction>(0, Nat.equal, Hash.hash);
  private var bids = HashMap.HashMap<AuctionId, [Bid]>(0, Nat.equal, Hash.hash);

  // Create a new auction
 public shared (msg) func createAuction(
    title : Text,
    description : Text,
    durationSeconds : Nat,
    reservePrice : Nat,
) : async Result.Result<AuctionId, Text> {  // Use Result.Result type
    let caller = msg.caller;

    // Check for anonymous principal and return an error instead of trapping
    if (Principal.isAnonymous(caller)) {
        return #err("Anonymous principals cannot create auctions. Please log in.");
    };

    let now = Time.now();
    let endTime = now + (durationSeconds * 1_000_000_000);

    let auction : Auction = {
        id = nextAuctionId;
        owner = caller;
        title = title;
        description = description;
        startTime = now;
        endTime = endTime;
        reservePrice = reservePrice;
        state = #Active;
    };

    auctions.put(nextAuctionId, auction);
    bids.put(nextAuctionId, []);

    let auctionId = nextAuctionId;
    nextAuctionId += 1;

    return #ok(auctionId); // Return the auction ID if successful
};



  // Get auction details
  public query func getAuction(auctionId : AuctionId) : async ?Auction {
    auctions.get(auctionId);
  };

  // Place a sealed bid (in a real Vickrey auction, the bid would be encrypted,
  // but for simplicity we're just keeping the bids private)
  public shared (msg) func placeBid(auctionId : AuctionId, amount : Nat) : async Bool {
    let caller = msg.caller;

    // Don't allow anonymous principals to bid
    if (Principal.isAnonymous(caller)) {
      Debug.trap("Anonymous principals cannot place bids");
    };

    switch (auctions.get(auctionId)) {
      case null { return false };
      case (?auction) {
        // Check if auction is active
        if (auction.state != #Active) {
          return false;
        };

        // Check if auction is still ongoing
        let now = Time.now();
        if (now > auction.endTime) {
          return false;
        };

        // Record the bid
        let bid : Bid = {
          bidder = caller;
          amount = amount;
          timestamp = now;
        };

        switch (bids.get(auctionId)) {
          case null {
            bids.put(auctionId, [bid]);
          };
          case (?existingBids) {
            let newBids = Array.append<Bid>(existingBids, [bid]);
            bids.put(auctionId, newBids);
          };
        };

        return true;
      };
    };
  };

  // End the auction and determine the winner
  public shared (msg) func endAuction(auctionId : AuctionId) : async ?{
    winner : Principal;
    price : Nat;
  } {
    let caller = msg.caller;

    switch (auctions.get(auctionId)) {
      case null { return null };
      case (?auction) {
        // Only the owner can end the auction, or it can end automatically if the endTime has passed
        if (caller != auction.owner and Time.now() < auction.endTime) {
          return null;
        };

        // Update auction state to ended
        let updatedAuction = {
          id = auction.id;
          owner = auction.owner;
          title = auction.title;
          description = auction.description;
          startTime = auction.startTime;
          endTime = auction.endTime;
          reservePrice = auction.reservePrice;
          state = #Ended;
        };
        auctions.put(auctionId, updatedAuction);

        // Get all bids for this auction
        switch (bids.get(auctionId)) {
          case null { return null };
          case (?auctionBids) {
            if (auctionBids.size() == 0) {
              return null;
            };

            // Sort bids by amount in descending order
            let sortedBids = Array.sort<Bid>(
              auctionBids,
              func(a, b) {
                if (a.amount > b.amount) { #less } else if (a.amount < b.amount) {
                  #greater;
                } else { #equal };
              },
            );

            // Check if highest bid meets reserve price
            if (sortedBids[0].amount < auction.reservePrice) {
              return null;
            };

            // Vickrey auction: winner pays the second-highest price
            var winningPrice = auction.reservePrice; // Default to reserve price

            if (sortedBids.size() > 1) {
              winningPrice := sortedBids[1].amount;
              // Ensure the second price is at least the reserve price
              if (winningPrice < auction.reservePrice) {
                winningPrice := auction.reservePrice;
              };
            };

            return ?{
              winner = sortedBids[0].bidder;
              price = winningPrice;
            };
          };
        };
      };
    };
  };

  // Get all active auctions
  public query func getActiveAuctions() : async [Auction] {
    var activeAuctions : [Auction] = [];

    for ((_, auction) in auctions.entries()) {
      if (auction.state == #Active and Time.now() <= auction.endTime) {
        activeAuctions := Array.append(activeAuctions, [auction]);
      };
    };

    return activeAuctions;
  };

  // Cancel an auction (only for the owner)
  public shared (msg) func cancelAuction(auctionId : AuctionId) : async Bool {
    let caller = msg.caller;

    switch (auctions.get(auctionId)) {
      case null { return false };
      case (?auction) {
        if (caller != auction.owner) {
          return false;
        };

        if (auction.state != #Active) {
          return false;
        };

        let updatedAuction = {
          id = auction.id;
          owner = auction.owner;
          title = auction.title;
          description = auction.description;
          startTime = auction.startTime;
          endTime = auction.endTime;
          reservePrice = auction.reservePrice;
          state = #Cancelled;
        };

        auctions.put(auctionId, updatedAuction);
        return true;
      };
    };
  };
};
