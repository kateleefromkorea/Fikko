# Food databases for Fikko's food search

How to add regional food composition data (so dishes like laksa, nasi lemak or
kimchi jjigae can be found), where each database lives, and what we may do with it.

Checked 4 October 2026. Re-check a licence before importing; owners change terms.

## Status

| Region | Database | Can we use it commercially? | Next step |
|---|---|---|---|
| Australia | [AFCD](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files) | Yes, with credit. Share-alike (CC BY-SA 3.0 AU) | Download, run the import script |
| Korea | RDA national standard table (Excel) | Yes, with credit (KOGL Type 1) | Download, then I add an importer |
| Korea | MFDS food nutrition DB (OpenAPI) | Yes, no restriction stated | Get an API key; can be searched live |
| Singapore | [SG FoodID](https://www.hpb.gov.sg/healthy-living/food-and-beverage/sgfoodid/) | Unknown | Email HPB (draft below) |
| Malaysia | [MyFCD](https://myfcd.moh.gov.my/) | Unknown | Email Ministry of Health (draft below) |
| Thailand | [Thai FCD](https://inmu.mahidol.ac.th/thaifcd/) | Non-commercial only; commercial needs permission | Email Mahidol (draft below) |
| Philippines | [PhilFCT](https://i.fnri.dost.gov.ph/fct/library) | Unknown, not downloadable | Contact FNRI via their website |
| Indonesia | [TKPI 2017](https://www.panganku.org/id-ID/berita/20) | Unknown | Contact the Ministry of Health nutrition directorate |
| Vietnam | [National Institute of Nutrition](http://viendinhduong.vn/vi/hop-tac-quoc-te/national-institute-of-nutrition-159.html) | Unknown | Contact the institute |

Already in the search: USDA FoodData Central (whole foods and prepared dishes, public domain)
and Open Food Facts (packaged products, ODbL).

## South Korea

1. **국가표준식품성분 DB (RDA, 농촌진흥청 국립농업과학원)**: the national standard table, 10th edition,
   updated yearly (about 3,300 foods, 130 nutrients each).
   - Download the Excel: [농식품올바로](https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562)
     (menu "국가표준식품성분 DB (Excel)다운로드"), or on [공공데이터포털 (file data)](https://www.data.go.kr/data/15123901/fileData.do).
   - Licence: the Excel DB is 공공누리 Type 1 (출처표시): attribution only, commercial use allowed.
     The PDF book is Type 2 (commercial use not allowed), so **use the Excel, not the PDF**.
2. **식품의약품안전처 식품영양성분DB (MFDS)**: a very large database that includes processed foods and dishes.
   - OpenAPI: [식품의약품안전처_식품영양성분DB정보](https://www.data.go.kr/data/15127578/openapi.do)
     on data.go.kr. Free, needs an API key from the portal. Listed as 이용허락범위 제한 없음 (no usage restriction).
     Development accounts get 10,000 requests a day.
   - Search portal: [식품영양성분 데이터베이스](https://various.foodsafetykorea.go.kr/nutrient/).
3. **Also on data.go.kr**: [전국통합식품영양성분정보(가공식품)표준데이터](https://www.data.go.kr/data/15100066/standard.do)
   (packaged foods).

Korean names matter here: members will type 비빔밥 or "bibimbap". The `regional_foods` table
has a `name_local` column for exactly this.

## Emails to send

Fill in the name and send from hello@fikko.io. Keep each short; officials reply faster to a
clear, small request. Change "[Database]" to the database's name.

### Singapore: Health Promotion Board (via https://www.hpb.gov.sg/contact-us/)

**Subject:** Request to use SG FoodID nutrition data in a wellness app

> Hello,
>
> I'm [Your name] from Fikko, a habit-tracking app that helps people log meals, water, sleep and
> activity. It is run by PipePiper, a company based in Seoul, South Korea. We're launching in
> Singapore, Australia and South Korea, and expanding across Southeast Asia. Fikko has a free plan
> and paid plans.
>
> Our meal log lets members search for foods and see calories, protein, carbohydrate and fat. Local
> dishes matter a great deal to our Singapore members, and the Singapore Food Insights Database
> (SG FoodID) is the best source for them.
>
> Could you tell us:
> 1. Whether we may use SG FoodID values (energy, protein, carbohydrate and fat per 100 g, with the
>    food name) inside our app, including in a commercial product;
> 2. Whether a data file or API is available, or whether we may download entries from the website;
> 3. How you'd like HPB credited, and whether there is any fee or agreement we should sign.
>
> We would show a credit to HPB on a "Food data sources" page and wherever the values appear.
>
> Thank you for your time.
>
> [Your name]
> Fikko · PipePiper, Seoul, South Korea
> hello@fikko.io · https://fikko.io

### Malaysia: Ministry of Health, Nutrition Division (nutrition@moh.gov.my)

**Subject:** Permission to use MyFCD data in a wellness app

> Dear Sir/Madam,
>
> I'm [Your name] from Fikko, a habit-tracking app (run by PipePiper, Seoul, South Korea) that helps
> people log meals, water, sleep and activity. We plan to serve members across Southeast Asia,
> including Malaysia, and we would like Malaysian dishes to be searchable in our meal log.
>
> The Malaysian Food Composition Database (MyFCD) is the right source. Could you tell us:
> 1. Whether we may use MyFCD values (food name, energy, protein, carbohydrate and fat per 100 g) in
>    our app, which has free and paid plans;
> 2. Whether the data is available as a file or through an API, rather than only through the website;
> 3. The credit line you'd like us to display, and any fee or agreement required.
>
> We would credit the Ministry of Health Malaysia on a "Food data sources" page and where the
> values are shown.
>
> Thank you,
> [Your name]
> Fikko · PipePiper, Seoul, South Korea · hello@fikko.io · https://fikko.io

### Thailand: Institute of Nutrition, Mahidol University (kunchit.jud@mahidol.ac.th, piyanut.sri@mahidol.ac.th)

The Thai site says non-commercial use is free and commercial use may need permission and fees,
so ask directly.

**Subject:** Commercial licence enquiry: Thai Food Composition Database

> Dear Institute of Nutrition team,
>
> I'm [Your name] from Fikko, a habit-tracking app (run by PipePiper, Seoul, South Korea) that lets
> people log meals, water, sleep and activity. We plan to serve members across Southeast Asia,
> including Thailand, and would like Thai foods to be searchable in our meal log.
>
> Your website notes that commercial use of the Online Thai Food Composition Database requires
> permission. We would like to ask:
> 1. Whether you can license the data (food names, energy, protein, carbohydrate and fat per 100 g)
>    for use in a commercial app with free and paid plans;
> 2. What the fee and terms would be;
> 3. Whether a data file is available, and how you'd like INMU credited.
>
> We would credit the Institute of Nutrition, Mahidol University as the source and copyright holder
> on a "Food data sources" page and wherever the values appear.
>
> With thanks,
> [Your name]
> Fikko · PipePiper, Seoul, South Korea · hello@fikko.io · https://fikko.io

### Philippines, Indonesia, Vietnam

Use the same email as Malaysia, changing the database name and the first paragraph:

- **Philippines:** Food and Nutrition Research Institute (DOST-FNRI), Philippine Food Composition
  Tables (PhilFCT). Their online version isn't downloadable, so ask for a data file. Find the contact
  on [fnri.dost.gov.ph](https://www.fnri.dost.gov.ph/).
- **Indonesia:** Kementerian Kesehatan RI, Direktorat Gizi Masyarakat, Tabel Komposisi Pangan
  Indonesia (TKPI 2017). Ask whether a spreadsheet exists; the published version is a PDF.
- **Vietnam:** Viện Dinh dưỡng (National Institute of Nutrition), Vietnamese Food Composition Table
  (Bảng thành phần thực phẩm Việt Nam, 2019). Ask for the data and permission to use it commercially.

I could not confirm email addresses for these three, so use each organisation's own contact page.

## Adding a database once you have the right to use it

1. Put the downloaded files in a folder.
2. Run `node scripts/build-regional-foods.mjs <source> <folder>`. Only `afcd` is built so far;
   a new source needs a short addition to that script.
3. Check the columns and sample rows it prints.
4. In Supabase, open the Table Editor, choose `regional_foods`, then Insert → Import data from CSV,
   and pick the file in `out/`.
5. Add the database's credit and licence to `public/food-data-sources.html`.

Searches are cached for up to a day, so new foods can take that long to appear.
