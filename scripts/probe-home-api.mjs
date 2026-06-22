// Pokémon HOME 非公式APIにチャンピオンズのランクマデータがあるか調査
const ENDPOINT = "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list";

async function probe(soft) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json",
        countrycode: "304",
        authorization: "Bearer",
        langcode: "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: JSON.stringify({ soft }),
    });
    const text = await res.text();
    return { soft, status: res.status, head: text.slice(0, 300) };
  } catch (e) {
    return { soft, error: e.message };
  }
}

for (const soft of ["Sw", "Sc", "Vi", "Za", "ZA", "Cp", "Ch", "Champions", "Po"]) {
  const r = await probe(soft);
  console.log(JSON.stringify(r));
}
