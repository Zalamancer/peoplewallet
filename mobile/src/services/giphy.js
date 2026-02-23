import Constants from 'expo-constants';

const API_KEY = Constants.expoConfig?.extra?.giphyApiKey || '';
const BASE_URL = 'https://api.giphy.com/v1/gifs';
const RATING = 'pg-13';

export const fetchTrending = async (offset = 0, limit = 20) => {
  const url = `${BASE_URL}/trending?api_key=${API_KEY}&rating=${RATING}&offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch trending GIFs');
  const data = await res.json();
  return data.data;
};

export const searchGifs = async (query, offset = 0, limit = 20) => {
  const url = `${BASE_URL}/search?api_key=${API_KEY}&q=${encodeURIComponent(query)}&rating=${RATING}&offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to search GIFs');
  const data = await res.json();
  return data.data;
};
