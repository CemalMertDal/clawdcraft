# ClawdCraft

Claude Code çalışırken yaptıklarını 2D bir Minecraft dünyasında canlandıran bir mod. Claude maskotu **Clawd** mesaj kutusunun üstündeki şeritte yürür. Veri çekerken balık tutar, dosya ararken maden kazar. Bir şey hata verirse creeper gelip patlar.

*A Claude Code mod that turns what Claude is doing into a little 2D Minecraft world: Clawd fishes while fetching data, mines while searching, and a creeper blows up when something fails. In-game text is Turkish. English notes are at the bottom.*

## Kurulum

Claude Code'da (terminal ya da masaüstü uygulamasının Code sekmesi):

```
/plugin marketplace add CemalMertDal/clawdcraft
/plugin install clawdcraft@clawdcraft
```

Ya da terminalden:

```bash
claude plugin marketplace add CemalMertDal/clawdcraft
claude plugin install clawdcraft@clawdcraft
```

Ardından yeni bir oturum aç. Güncellemek için: `claude plugin marketplace update clawdcraft`, ardından `claude plugin update clawdcraft@clawdcraft`.

İlk deneme için `/mc demo` yaz. Bütün animasyonlar yaklaşık 50 saniyede sırayla oynar.

## Clawd ne yapıyor?

| Claude'un yaptığı | Dünyada |
|---|---|
| Veri çekme (WebFetch, WebSearch, MCP araçları, `curl`) | Gölette balık tutar |
| Arama (Grep, Glob) | Kazmayla maden kazar, elmas bulur |
| Dosya okuma | Kürsüde kitap okur |
| Dosya düzenleme | Çalışma masasında çalışır |
| Yeni dosya yazma | Blok yerleştirir |
| Komut çalıştırma | Fırını yakar |
| Testler | Yayla hedefe ok atar |
| `git commit` / `git push` | Sandığa koyar / havai fişek atar |
| Skill | Büyü masasında büyü yapar |
| Subagent | Yanına kurt yoldaş gelir |
| İzin bekleme | "?" tabelası tutar |
| Hata | **Creeper gelir ve patlar** |
| Tur bitince | Meşale diker |
| Boşta (1 dakika) | Gece olur, kamp ateşinin yanında uyur |

Clawd yürüdükçe biyomlar değişir: çayır, orman, çöl, karlı tayga, mantar adası, uzun yolda Nether. Yolculuk ve 14 başarım oturumdan oturuma saklanır.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `/mc` | Şerit ile yan panel arasında geçiş |
| `/mc band` / `/mc pane` / `/mc hide` | Şerit / panel / gizle |
| `/mc stats` | Yolculuk ve başarımlar |
| `/mc demo` | Bütün animasyonları sırayla oynatır |
| `/mc yeni` | Yeni bir dünya başlatır |

## Notlar

- **Token harcamaz.** Mod modeli hiç çağırmaz, sistem prompt'una ya da konuşmaya bir şey eklemez. Tek istisna `/mc` komutlarının çıktısı. Model onu bir sonraki turda okur, `/mc stats` için yaklaşık 300–400 token.
- **Ağa çıkmaz.** Her şey bilgisayarında çizilir. Kalıcı veri (yolculuk, başarımlar) Claude Code'un plugin deposunda tutulur.
- **Masaüstü ve terminal:** Masaüstünde animasyonlu SVG, terminalde yarım blok (`▀`) karakterlerle piksel sanatı olarak çizilir.
- **Erken erişim API'si:** Claude Code'un mod (function hooks) API'sini kullanır, bu API sürümler arasında değişebilir. Claude Code 2.1.286 ile test edildi.

## Geliştirme

```bash
claude plugin validate plugins/clawdcraft
claude plugin test plugins/clawdcraft
claude --plugin-dir plugins/clawdcraft
```

Kod `plugins/clawdcraft/hooks/` altında:

| Dosya | İçerik |
|---|---|
| `register.tsx` | Hook'lar ve `/mc` komutu |
| `world.ts` | Dünya ve durum geçişleri |
| `scene.ts` | Sahne kompozisyonu |
| `render-svg.ts` | Masaüstü çizici |
| `render-raster.ts` | Terminal çizici |
| `sprites.ts` | Piksel sanatı |

## English

Install with `/plugin marketplace add CemalMertDal/clawdcraft`, then `/plugin install clawdcraft@clawdcraft`. Start a new session and try `/mc demo`.

- **No model tokens:** The mod never calls the model and adds nothing to the prompt, except the text of `/mc` commands you run.
- **Works offline:** It runs entirely on your machine and makes no network requests.
- **Surfaces:** It draws animated SVG on the desktop app and half-block pixel art in the terminal.
- **Early-access API:** It is built on Claude Code's early-access function-hooks API, so a future release may break it.

## Lisans

MIT
