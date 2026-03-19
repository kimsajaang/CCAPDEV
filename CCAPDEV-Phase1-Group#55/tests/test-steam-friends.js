require('dotenv').config();
const fetch = require('node-fetch') || global.fetch;

async function test() {
  const steamId = '76561198255805007';
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    console.error('No STEAM_API_KEY found in environment');
    return;
  }
  console.log('Testing Steam friends for', steamId);
  const steamUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`;
  
  try {
    const res = await fetch(steamUrl);
    console.log('Status:', res.status);
    if (!res.ok) {
      const text = await res.text();
      console.log('Error body:', text);
      return;
    }
    const data = await res.json();
    if (data.friendslist && data.friendslist.friends) {
      console.log(`Successfully fetched ${data.friendslist.friends.length} friends!`);
    } else {
      console.log('No friendslist in response:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
