export async function buscarYObtenerCaratula(artist: string, title: string): Promise<string | null> {
    try {
        const query = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
        const url = `https://api.deezer.com/search?q=${query}&limit=1`;
        
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            const album = data.data[0].album;
            return album.cover_xl || album.cover_big || album.cover_medium || null;
        }
        return null;
    } catch (error) {
        console.error("Error buscando la carátula:", error);
        return null;
    }
  }
