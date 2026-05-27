# Ho Chi Minh City Cancer Symptom and Cancer Literacy Research

View on the class site: [raw data and Tableau file](https://us-east-1.online.tableau.com/#/site/boothdataviz/workbooks/4725631?:origin=card_share_link) *(Begin by clicking Story 1)*

View the visualization site: [visualization site](https://grant-atl.github.io/Data-Visualization-Booth-2026---Final-Project/visualization-site/)

View the summary dashboard: [summary dashboard](https://grant-atl.github.io/Data-Visualization-Booth-2026---Final-Project/visualization-site/dashboard.html)

View the ReadMe site: [ReadMe](https://grant-atl.github.io/Data-Visualization-Booth-2026---Final-Project/)

View the data files (only shared with instructors): [data files](https://drive.google.com/drive/folders/1xueU8NaxeS7-TmZuOAgvSEQn19CEWIbD?usp=sharing)

## Project overview

This project visualizes a descriptive survey about breast and liver cancer warning signs among respondents in Ho Chi Minh City. I wanted to explore how self-reported warning signs vary by district, age group, symptom type, selected lifestyle measures, and health-context variables.

The analysis is descriptive. Reported warning signs are not to be interpreted as cancer diagnoses, and the visualizations should not be read as causal evidence.

Primary finding: In the cleaned public survey dataset, 127 of 170 respondents reported at least one breast or liver cancer warning sign, or 74.7% of the sample.


## Project components

| File | Purpose |
|---|---|
| `Final - Data Viz - Grant Pedersen.twbx` | Final Tableau workbook. Contains the story, dashboards, worksheets, parameters, calculated fields, and data sources. |
| `hcmc_cancer_health_survey_cleaned_analysis_ready.csv` | Cleaned survey dataset. Contains the analysis-ready survey fields, translated labels, symptom flags, lifestyle variables, health-context fields, and response-quality flags. |
| `vietnam_Districts_level_2.geojson` | District boundary file used for map views.

## Story structure

The final workbook is organized into four story pages.

| Story page | Purpose |
|---|---|
| About the project | Provides background on why the research was conducted and explains that this project uses the public subset of a larger research effort. |
| Research Overview | Summarizes the survey sample, overall symptom-reporting rate, symptom-domain profile, and district-level variation. |
| Symptom Tracker | Lets users choose a specific symptom and compare the selected symptom across districts and age groups. |
| Lifestyle Effects | Lets users choose a lifestyle metric and compare that metric by symptom status and social-support grouping. |

## Dashboards and worksheets

### Research Overview dashboard

This dashboard introduces the sample and gives the viewer a high-level summary of symptom reporting.

| Worksheet | Role |
|---|---|
| `Dashboard Headline` | Displays the survey sample size and overall symptom-reporting rate. |
| `Survey Snapshot - Symptom Profile` | Shows the percentage of respondents with no symptoms, liver symptoms only, breast symptoms only, or both breast and liver symptoms. |
| `District Symptom Rate Ranking` | Ranks districts by the percentage of respondents who reported at least one symptom. |
| `District Map` | Maps district-level symptom rates using the district boundary file. |

### Symptom Tracker dashboard

This dashboard is parameter-driven. It allows the viewer to choose a warning sign and see how that symptom varies geographically and demographically.

| Worksheet | Role |
|---|---|
| `Dynamic District Ranking` | Updates the district ranking based on the selected symptom. |
| `Symptom Map` | Maps the selected symptom rate by district. |
| `Selected Symptom by Age Group` | Shows the selected symptom rate across age groups. |

### Lifestyle Effects dashboard

This dashboard compares selected lifestyle and health measures across symptom-reporting groups.

| Worksheet | Role |
|---|---|
| `Social Support vs Symptom Rate` | Compares the selected lifestyle value across social-support groups. |
| `Lifestyle Comparison by Symptom Status` | Compares the selected lifestyle metric for respondents with and without reported symptoms. |

## Filters, parameters, and interactions

The Tableau workbook uses two main parameters to make the dashboards interactive.

### `Selected Symptom`

The `Selected Symptom` parameter allows the user to choose which symptom to explore on the map and district ranking charts. This parameter controls the calculated field `Selected Symptom Rate Field`, which dynamically changes the symptom rate shown on the map, ranking chart, and symptom tracker views.

Parameter options include:

```text
Any Symptom
Breast Lump
Breast Shape Change
Breast Skin Dimpling
Nipple Discharge
Breast Pain
Rib Cage Lump
Upper Right Abdominal Pain
Jaundice
Weight Loss
Fatigue
```

### `Lifestyle Metric`

The `Lifestyle Metric` parameter allows the user to switch between lifestyle and health measures. This parameter controls the calculated field `Selected Lifestyle Value`, which updates the Lifestyle Effects dashboard dynamically.

Parameter options include:

```text
Red meat meals/week
Vegetable meals/week
Alcohol times/week
Exercise times/week
Sleep hours/day
Social support hours/week
BMI
```

### Main interactions

- Selecting a symptom from the `Selected Symptom` dropdown updates the district map, district ranking, and age-group symptom chart.
- Selecting a metric from the `Lifestyle Metric` dropdown updates the lifestyle comparison chart.
- The district map and district ranking can be used to focus attention on specific districts.
- Filters are applied across related worksheets so users can compare symptom patterns by age, gender, district, and health context.

## Data source and cleaning notes

The original survey data came from a Qualtrics export. The first cleaning step removed Qualtrics metadata rows and renamed the survey fields into cleaner English column names. The cleaned dataset contains 170 survey responses.

Cleanup also involved working with a friend to translate relevant fields and labels from Vietnamese to English so the Tableau dashboards would be readable for an English-speaking audience.

Several original survey fields were coded numerically, so English label fields were added for easier analysis in Tableau. For example, yes/no symptom fields were converted into readable labels such as `Yes` and `No`. Additional analysis fields were created in the cleaned data, age group, symptom counts, any-symptom flags, social-support hours, and response-quality flags.

The original latitude and longitude fields from Qualtrics were not reliable for district-level mapping because they were based on approximate GeoIP location rather than the respondent's self-reported district. To address this, the original GeoIP coordinates were preserved in separate fields, and the main `location_latitude` and `location_longitude` fields were replaced with district-based representative coordinates. This allowed the Tableau maps to show district-level symptom patterns more accurately.

The dataset also includes translated English columns and cleaned fields for analysis. Some fields, such as district names and district coordinates, were added based on the self-reported district code.

## Calculated fields and formulas

The workbook uses calculated fields to summarize symptom reporting and support interactivity. Field names may differ slightly between Tableau aliases and the cleaned CSV column names.

### `N Respondents`

```tableau
COUNTD([respondent_id])
```

Used to count unique survey respondents.

### `Any Symptom Rate`

```tableau
AVG([any_symptom])
```

Used to calculate the percentage of respondents who reported at least one symptom.

### `Breast Symptom Rate`

```tableau
AVG([any_breast_symptom])
```

Used to calculate the percentage of respondents who reported at least one breast-related symptom.

### `Liver Symptom Rate`

```tableau
AVG([any_liver_symptom])
```

Used to calculate the percentage of respondents who reported at least one liver-related symptom.

### `Symptom Domain Profile`

```tableau
IF [any_breast_symptom] = 1 AND [any_liver_symptom] = 1 THEN "Breast + liver symptoms"
ELSEIF [any_breast_symptom] = 1 THEN "Breast symptoms only"
ELSEIF [any_liver_symptom] = 1 THEN "Liver symptoms only"
ELSE "No reported symptoms"
END
```

Used to classify respondents by the type of symptoms they reported.

### `Symptom Status`

```tableau
IF [any_symptom] = 1 THEN "Reported Symptoms"
ELSE "No Reported Symptoms"
END
```

Used to compare lifestyle and health metrics between respondents who did and did not report symptoms.

### `Selected Symptom Rate Field`

```tableau
CASE [Selected Symptom]
WHEN "Any Symptom" THEN
    IF [Any Symptom] = 1 THEN 1 ELSE 0 END
WHEN "Breast Lump" THEN
    IF [Breast Lump Or Swelling Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Breast Shape Change" THEN
    IF [Breast Size Or Shape Change Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Breast Skin Dimpling" THEN
    IF [Breast Dimpling Or Skin Thickening Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Nipple Discharge" THEN
    IF [Nipple Discharge Or Blood Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Breast Pain" THEN
    IF [Persistent Breast Or Nipple Pain Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Rib Cage Lump" THEN
    IF [Hard Lump Right Below Rib Cage Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Upper Right Abdominal Pain" THEN
    IF [Right Upper Abdominal Discomfort Or Pain Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Jaundice" THEN
    IF [Jaundice Skin Or Eyes Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Weight Loss" THEN
    IF [Unexplained Weight Loss Recent Label En] = "Yes" THEN 1 ELSE 0 END
WHEN "Fatigue" THEN
    IF [Unusual Fatigue Or Weakness Recent Label En] = "Yes" THEN 1 ELSE 0 END
END
```

Used to dynamically update the symptom map and related charts based on the selected symptom parameter.

### `Selected Lifestyle Value`

```tableau
CASE [Lifestyle Metric]
WHEN "Red meat meals/week" THEN [red_meat_meals_per_week]
WHEN "Vegetable meals/week" THEN [vegetable_meals_per_week]
WHEN "Alcohol times/week" THEN [alcohol_times_per_week]
WHEN "Exercise times/week" THEN [exercise_times_per_week]
WHEN "Sleep hours/day" THEN [sleep_hours_per_day_clean]
WHEN "Social support hours/week" THEN [social_support_hours_per_week]
WHEN "BMI" THEN [bmi]
END
```

Used to dynamically change the metric shown in the Lifestyle Effects dashboard.

### `Health Context Score`

```tableau
IF [current_liver_or_breast_cancer_label_en] = "Yes" THEN 1 ELSE 0 END
+
IF [prior_cancer_history_label_en] = "Yes" THEN 1 ELSE 0 END
+
IF [family_cancer_history_label_en] = "Yes" THEN 1 ELSE 0 END
+
IF [chronic_disease_label_en] = "Yes" THEN 1 ELSE 0 END
```

Used to create a simple descriptive score showing how many health-history factors a respondent reported.

### `Health Context Group`

```tableau
IF [Health Context Score] = 0 THEN "No reported health-history factor"
ELSEIF [Health Context Score] = 1 THEN "1 health-history factor"
ELSEIF [Health Context Score] = 2 THEN "2 health-history factors"
ELSE "3–4 health-history factors"
END
```

Used to group respondents by overall health-history context.

### `Social Support Group`

```tableau
IF ISNULL([social_support_hours_per_week]) THEN "Missing"
ELSEIF [social_support_hours_per_week] = 0 THEN "No reported support"
ELSEIF [social_support_hours_per_week] < 7 THEN "Low"
ELSEIF [social_support_hours_per_week] < 21 THEN "Moderate"
ELSE "High"
END
```

Used to compare symptom rates across different levels of reported social support.

### `Total Symptom Count Bins`

```tableau
IF [total_symptom_count] = 0 THEN "0 symptoms"
ELSEIF [total_symptom_count] = 1 THEN "1 symptom"
ELSEIF [total_symptom_count] <= 3 THEN "2–3 symptoms"
ELSE "4+ symptoms"
END
```

Used to group respondents by symptom burden.

### `District Point`

```tableau
MAKEPOINT([location_latitude], [location_longitude])
```

Used to map respondents by district-based representative coordinates.

## Main findings shown in the workbook

The Tableau story highlights several descriptive patterns:

- Overall symptom reporting: 127 of 170 respondents reported at least one breast or liver cancer warning sign.
- Symptom-domain profile: 43 respondents reported no breast or liver warning signs, 25 reported liver warning signs only, 2 reported breast warning signs only, and 100 reported both breast and liver warning signs.
- District variation: symptom-reporting rates vary by district, but districts with small respondent counts should be interpreted cautiously.
- Age-group variation: the Symptom Tracker page shows how selected symptoms differ across age groups.
- Lifestyle comparison: the Lifestyle Effects page compares selected lifestyle variables across respondents with and without reported symptoms.
- Health context: health-history factors are included to support descriptive comparisons, not diagnosis or causal inference.

## Interpretation notes and limitations

This project is intended as a data visualization and EDA. I am not making medical diagnoses or causal claims.

Key limitations:

- The survey responses are self-reported.
- Reported warning signs are not confirmed cancer diagnoses.
- The public dataset contains 170 respondents, which limits generalizability.
- Some districts have small sample sizes, so district-level comparisons should be read carefully.
- Lifestyle comparisons are descriptive and do not show that a lifestyle factor caused symptom reporting.
- The visualized dataset is the public subset available for this project; additional project data remained confidential.

## Design approach

The story structure moves from project context, to overall findings, to symptom exploration, to lifestyle exploration.

Design choices include:

- maps and district rankings for geographic comparison;
- parameter-driven interactivity for symptom and lifestyle exploration;
- consistent color use for symptom-rate views;
- direct labels on bars and maps where possible;

## Audience and research questions

The primary audience for this project is my undergraduate university research team showing the results of our Ho Chi Minh City cancer-symptom survey. The goal is to present the findings from the research we conducted in a clear, professional, and self-contained format so viewers can understand the main patterns in reported breast and liver cancer warning signs across the survey sample.

This project answers three main research questions:

1. How common is self-reported breast or liver cancer warning-sign reporting among respondents in Ho Chi Minh City?
2. How do reported warning signs vary by district, age group, and symptom type?
3. How do selected lifestyle, social-support, and health-context measures compare across respondents with and without reported warning signs?

The analysis is descriptive rather than diagnostic or causal. The goal is to communicate patterns from the research sample, not to estimate cancer prevalence in Ho Chi Minh City or prove that any lifestyle factor causes symptom reporting.

## LLM usage
I used Codex during data preparation to help translate and clarify Vietnamese survey labels into English and rename fields into readable analysis-ready column names. I also used Codex to help me with the JS code for the interactive charts.

## Data validation and cleaning checks

Before building the Tableau workbook and web visualization, I checked that the cleaned dataset was analysis-ready.

Validation checks included:

- Confirmed the cleaned web-ready dataset contains 170 survey responses.
- Confirmed there are 170 unique respondent IDs, with no blank respondent IDs.
- Confirmed the dataset includes more than 5 columns, with 92 columns in the web-ready CSV.
- Confirmed 19 Ho Chi Minh City districts are represented in the survey sample.
- Confirmed the main headline count: 127 respondents reported at least one breast or liver cancer warning sign, and 43 respondents reported no warning signs.
- Confirmed the symptom-domain counts used in the visualization: 100 respondents reported both breast and liver warning signs, 25 reported liver signs only, 2 reported breast signs only, and 43 reported no warning signs.
- Preserved original Qualtrics GeoIP coordinates in separate fields, then replaced the main mapping coordinates with district-level representative coordinates because the original GeoIP locations were not reliable for district-level analysis.
- Added response-quality fields to flag possible sleep-entry issues, anthropometric data issues, and responses needing review.
- Checked that the district boundary GeoJSON loaded correctly for the map-based views.


## Visualization site tech stack

In addition to the Tableau workbook, I built a supplemental web visualization site to present the findings in an interactive, scroll-based format.

The site uses:

- HTML, CSS, and JS for the page structure, styling, and interaction.
- D3.js for the custom charts, including the dot grid, chord diagram, correlation matrix, and Sankey-style age flow.
- MapLibre GL JS for the interactive Ho Chi Minh City district map.
- OpenFreeMap for the basemap tiles.
- A GeoJSON district boundary file for the map: `visualization-site/data/hcmc-districts.geojson`.

The web visualization is supplemental to the Tableau workbook.