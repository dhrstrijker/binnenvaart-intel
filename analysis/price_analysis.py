"""
Price Drivers Analysis for Binnenvaart Intel
Comprehensive analysis: correlations, regression, engine hours, segmentation,
broker pricing, deal score formula, price metrics, time-on-market.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.inspection import partial_dependence
from sklearn.decomposition import PCA
import warnings
warnings.filterwarnings('ignore')

CHARTS_DIR = '/Users/dylanstrijker/binnenvaart-intel/analysis/charts'
DATA_PATH = '/Users/dylanstrijker/binnenvaart-intel/analysis/extracted_data_priced.csv'
ALL_DATA_PATH = '/Users/dylanstrijker/binnenvaart-intel/analysis/extracted_data_all.csv'

# Color palette
COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777',
          '#0891b2', '#65a30d']

plt.rcParams.update({
    'figure.dpi': 150,
    'font.size': 10,
    'axes.titlesize': 13,
    'axes.labelsize': 11,
    'figure.facecolor': 'white',
})

# =============================================================================
# Load data
# =============================================================================
print("=" * 70)
print("LOADING DATA")
print("=" * 70)

df = pd.read_csv(DATA_PATH)
df_all = pd.read_csv(ALL_DATA_PATH)

# Convert is_outlier to bool
df['is_outlier'] = df['is_outlier'].map({'True': True, 'False': False, True: True, False: False})
df_all['is_outlier'] = df_all['is_outlier'].map({'True': True, 'False': False, True: True, False: False})

print(f"Priced dataset: {len(df)} vessels")
print(f"All dataset: {len(df_all)} vessels")
print(f"Outliers: {df['is_outlier'].sum()}")
print(f"\nColumns: {list(df.columns)}")
print(f"\nTypes distribution:\n{df['type'].value_counts()}")
print(f"\nSource distribution:\n{df['source'].value_counts()}")

# Non-outlier subset for modeling
df_clean = df[df['is_outlier'] == False].copy()
print(f"\nClean dataset (no outliers): {len(df_clean)} vessels")

# Numeric columns for correlation
numeric_cols = ['price', 'length_m', 'width_m', 'tonnage', 'build_year',
                'engine_hours', 'engine_power_hp', 'generator_kva',
                'bow_thruster_hp', 'fuel_tank_liters', 'num_holds',
                'price_per_meter', 'price_per_ton', 'vessel_age',
                'days_on_market']

# =============================================================================
# 1. CORRELATION MATRIX
# =============================================================================
print("\n" + "=" * 70)
print("1. CORRELATION ANALYSIS")
print("=" * 70)

corr_df = df_clean[numeric_cols].dropna(how='all', axis=1)
corr_matrix = corr_df.corr()

# Correlations with price
price_corr = corr_matrix['price'].drop('price').sort_values(ascending=False)
print("\nCorrelations with price:")
for feat, val in price_corr.items():
    n_valid = corr_df[['price', feat]].dropna().shape[0]
    print(f"  {feat:25s}: {val:+.3f}  (n={n_valid})")

# Heatmap
fig, ax = plt.subplots(figsize=(12, 10))
mask = np.triu(np.ones_like(corr_matrix, dtype=bool))
sns.heatmap(corr_matrix, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r',
            center=0, vmin=-1, vmax=1, square=True, linewidths=0.5,
            cbar_kws={'shrink': 0.8}, ax=ax)
ax.set_title('Correlation Matrix - Vessel Features vs Price\n(n varies per feature pair)')
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/correlation_heatmap.png')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/correlation_heatmap.png")

# =============================================================================
# 2. GRADIENT BOOSTING REGRESSION
# =============================================================================
print("\n" + "=" * 70)
print("2. GRADIENT BOOSTING REGRESSION")
print("=" * 70)

model_features = ['length_m', 'tonnage', 'build_year', 'engine_hours',
                  'engine_power_hp']
cat_features = ['type', 'source']

# Prepare data - drop rows with NaN in key features
model_df = df_clean[model_features + cat_features + ['price']].dropna(subset=model_features + ['price'])
print(f"\nSample size after dropping NaNs in key features: {len(model_df)}")
print(f"Dropped {len(df_clean) - len(model_df)} rows due to missing values")
print(f"Missing value counts before drop:")
for col in model_features:
    n_miss = df_clean[col].isna().sum()
    print(f"  {col}: {n_miss} missing ({n_miss/len(df_clean)*100:.1f}%)")

if len(model_df) < 300:
    print(f"\n*** WARNING: n={len(model_df)} < 300 — overfitting risk is elevated ***")

# One-hot encode categoricals
model_encoded = pd.get_dummies(model_df, columns=cat_features, drop_first=True)
X = model_encoded.drop('price', axis=1)
y = model_encoded['price']

feature_names = X.columns.tolist()

# Gradient Boosting with conservative hyperparameters for small dataset
gbr = GradientBoostingRegressor(
    n_estimators=200,
    max_depth=4,
    learning_rate=0.05,
    min_samples_leaf=10,
    subsample=0.8,
    random_state=42
)

# 5-fold cross-validation
cv_scores = cross_val_score(gbr, X, y, cv=5, scoring='r2')
print(f"\n5-Fold Cross-Validation R²:")
print(f"  Mean: {cv_scores.mean():.4f}")
print(f"  Std:  {cv_scores.std():.4f}")
print(f"  Per fold: {[f'{s:.4f}' for s in cv_scores]}")

# Fit on full data for feature importance
gbr.fit(X, y)
train_r2 = gbr.score(X, y)
print(f"  Train R²: {train_r2:.4f}")

# Feature importance
importances = pd.Series(gbr.feature_importances_, index=feature_names)
importances = importances.sort_values(ascending=True)

fig, ax = plt.subplots(figsize=(10, 8))
importances.plot(kind='barh', ax=ax, color=COLORS[0])
ax.set_xlabel('Feature Importance (Gini)')
ax.set_title(f'Gradient Boosting Feature Importance\n'
             f'5-Fold CV R² = {cv_scores.mean():.3f} +/- {cv_scores.std():.3f} | n={len(model_df)}')
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/feature_importance.png')
plt.close()
print(f"Saved: {CHARTS_DIR}/feature_importance.png")

# Top 5 features
print("\nTop 5 most important features:")
for feat, imp in importances.sort_values(ascending=False).head(5).items():
    print(f"  {feat:30s}: {imp:.4f}")

# =============================================================================
# 3. ENGINE HOURS DEEP DIVE
# =============================================================================
print("\n" + "=" * 70)
print("3. ENGINE HOURS DEEP DIVE")
print("=" * 70)

eh_df = df_clean.dropna(subset=['engine_hours', 'price'])
print(f"\nVessels with engine hours and price: {len(eh_df)}")

# 3a. Scatter plot: engine hours vs price, colored by type
types_with_eh = eh_df['type'].value_counts()
print(f"\nType distribution (with engine hours):")
for t, c in types_with_eh.items():
    print(f"  {t}: {c}")

top_types = types_with_eh[types_with_eh >= 5].index.tolist()

fig, ax = plt.subplots(figsize=(12, 8))
for i, vtype in enumerate(top_types):
    subset = eh_df[eh_df['type'] == vtype]
    ax.scatter(subset['engine_hours'], subset['price'] / 1e6,
              label=f'{vtype} (n={len(subset)})', alpha=0.6,
              color=COLORS[i % len(COLORS)], s=50, edgecolors='white', linewidth=0.5)

# Plot types with < 5 as "Other"
other = eh_df[~eh_df['type'].isin(top_types)]
if len(other) > 0:
    ax.scatter(other['engine_hours'], other['price'] / 1e6,
              label=f'Other (n={len(other)})', alpha=0.4,
              color='grey', s=30, edgecolors='white', linewidth=0.5)

ax.set_xlabel('Engine Hours')
ax.set_ylabel('Price (EUR millions)')
ax.set_title(f'Engine Hours vs Price by Vessel Type (n={len(eh_df)})')
ax.legend(loc='upper right', fontsize=8)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/engine_hours_vs_price.png')
plt.close()
print(f"Saved: {CHARTS_DIR}/engine_hours_vs_price.png")

# 3b. Within-type analysis for Motorvrachtschip
mvs = eh_df[eh_df['type'] == 'Motorvrachtschip'].copy()
print(f"\nMotorvrachtschip subset: {len(mvs)} vessels")

if len(mvs) >= 10:
    corr_mvs = mvs[['engine_hours', 'price']].corr().iloc[0, 1]
    print(f"  Engine hours / price correlation: {corr_mvs:.3f}")

    corr_mvs_controlled = mvs[['engine_hours', 'price', 'length_m', 'tonnage', 'build_year']].dropna().corr()
    print(f"  Partial correlation matrix (MVS):")
    for col in ['length_m', 'tonnage', 'build_year']:
        print(f"    engine_hours / {col}: {corr_mvs_controlled.loc['engine_hours', col]:.3f}")

# 3c. Partial dependence of engine hours
print("\nPartial dependence of engine hours on price (from GBM):")
eh_col_idx = feature_names.index('engine_hours') if 'engine_hours' in feature_names else None

if eh_col_idx is not None:
    pd_result = partial_dependence(gbr, X, features=[eh_col_idx], kind='average',
                                    grid_resolution=20)
    # sklearn 1.6+ uses 'grid_values' instead of 'values'
    if hasattr(pd_result, 'grid_values'):
        eh_values = pd_result['grid_values'][0]
    else:
        eh_values = pd_result['values'][0]
    eh_pdp = pd_result['average'][0]

    # Estimate price effect of 10,000 additional engine hours
    eh_range = eh_values[-1] - eh_values[0]
    pdp_range = eh_pdp[-1] - eh_pdp[0]
    price_per_10k_hours = (pdp_range / eh_range) * 10000
    print(f"  Estimated price effect of 10,000 additional engine hours: {price_per_10k_hours:,.0f} EUR")
    print(f"  (Based on PDP range: {eh_values[0]:.0f} to {eh_values[-1]:.0f} hours)")

# 3d. Sweet spots: below-median engine hours AND below-median price-per-ton for their type
print("\nSweet Spot Vessels (below-median engine hours AND price-per-ton within type):")
sweet_spots = []
for vtype in eh_df['type'].unique():
    type_df = eh_df[eh_df['type'] == vtype].dropna(subset=['price_per_ton', 'engine_hours'])
    if len(type_df) < 5:
        continue
    med_eh = type_df['engine_hours'].median()
    med_ppt = type_df['price_per_ton'].median()
    matches = type_df[(type_df['engine_hours'] < med_eh) & (type_df['price_per_ton'] < med_ppt)]
    for _, row in matches.iterrows():
        sweet_spots.append({
            'name': row['name'],
            'type': vtype,
            'price': row['price'],
            'engine_hours': row['engine_hours'],
            'price_per_ton': row['price_per_ton'],
            'tonnage': row.get('tonnage', None),
            'length_m': row.get('length_m', None),
        })

sweet_df = pd.DataFrame(sweet_spots)
if len(sweet_df) > 0:
    sweet_df = sweet_df.sort_values('price_per_ton')
    print(f"  Found {len(sweet_df)} sweet spot vessels:")
    for _, row in sweet_df.head(15).iterrows():
        print(f"    {row['name']:25s} | {row['type']:25s} | EUR {row['price']:>12,.0f} | "
              f"{row['engine_hours']:>8,.0f} hrs | {row['price_per_ton']:>8,.0f} EUR/ton")
else:
    print("  No sweet spot vessels found")

# 3e. Engine revision interaction
print("\nEngine revision interaction test:")
print("  Checking raw_details for revision info is not available in extracted CSV.")
print("  Limitation: Cannot test engine revision interaction without raw_details column.")

# =============================================================================
# 4. MARKET SEGMENTATION (K-Means)
# =============================================================================
print("\n" + "=" * 70)
print("4. MARKET SEGMENTATION")
print("=" * 70)

seg_features = ['length_m', 'tonnage', 'build_year', 'price']
seg_df = df_clean[seg_features + ['name', 'type', 'engine_hours', 'vessel_age']].dropna(subset=seg_features)
print(f"\nSegmentation sample size: {len(seg_df)}")

scaler = StandardScaler()
X_seg = scaler.fit_transform(seg_df[seg_features])

# Elbow method
inertias = []
k_range = range(3, 9)
for k in k_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_seg)
    inertias.append(km.inertia_)

fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(list(k_range), inertias, 'bo-', linewidth=2, markersize=8)
ax.set_xlabel('Number of Clusters (k)')
ax.set_ylabel('Inertia (Within-Cluster Sum of Squares)')
ax.set_title(f'Elbow Method for Optimal k (n={len(seg_df)})')
ax.grid(True, alpha=0.3)

# Mark the "elbow" — use second derivative
diffs = np.diff(inertias)
diffs2 = np.diff(diffs)
optimal_k_idx = np.argmax(diffs2) + 3  # offset by k_range start
ax.axvline(x=optimal_k_idx, color='red', linestyle='--', alpha=0.7,
           label=f'Suggested k={optimal_k_idx}')
ax.legend()
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/elbow_plot.png')
plt.close()
print(f"Saved: {CHARTS_DIR}/elbow_plot.png")
print(f"Suggested optimal k: {optimal_k_idx}")

# Use k=5 as a reasonable default (can adjust based on elbow)
optimal_k = optimal_k_idx
if optimal_k < 4:
    optimal_k = 5  # ensure enough granularity
print(f"Using k={optimal_k} for final clustering")

km_final = KMeans(n_clusters=optimal_k, random_state=42, n_init=20)
seg_df['cluster'] = km_final.fit_predict(X_seg)

# Segment profiles
print(f"\nSegment Profiles:")
profiles = []
for c in range(optimal_k):
    cluster_data = seg_df[seg_df['cluster'] == c]
    profile = {
        'cluster': c,
        'count': len(cluster_data),
        'avg_price': cluster_data['price'].mean(),
        'avg_length': cluster_data['length_m'].mean(),
        'avg_tonnage': cluster_data['tonnage'].mean(),
        'avg_age': cluster_data['vessel_age'].mean() if 'vessel_age' in cluster_data else None,
        'avg_engine_hours': cluster_data['engine_hours'].mean(),
        'dominant_type': cluster_data['type'].mode().iloc[0] if len(cluster_data['type'].mode()) > 0 else 'N/A',
        'type_pct': (cluster_data['type'].value_counts().iloc[0] / len(cluster_data) * 100) if len(cluster_data) > 0 else 0,
    }
    profiles.append(profile)

profiles_df = pd.DataFrame(profiles).sort_values('avg_price', ascending=False)

# Name clusters based on profiles
cluster_names = {}
for _, row in profiles_df.iterrows():
    c = row['cluster']
    price = row['avg_price']
    length = row['avg_length']
    age = row['avg_age']
    dom_type = row['dominant_type']

    if price > 2_000_000:
        name = "Premium Large Cargo"
    elif price > 1_000_000 and length > 80:
        name = "Mid-Range Heavy Haulers"
    elif price > 500_000 and age < 40:
        name = "Modern Mid-Sized Fleet"
    elif price > 500_000:
        name = "Established Workhorses"
    elif 'Tanker' in str(dom_type) or 'tanker' in str(dom_type):
        name = "Specialty Tankers"
    elif price < 300_000:
        name = "Budget River Classics"
    else:
        name = "Value Segment"

    cluster_names[c] = name

# Deduplicate names
seen = {}
for c, name in cluster_names.items():
    if name in seen.values():
        # Append a differentiator
        row_data = profiles_df[profiles_df['cluster'] == c].iloc[0]
        if row_data['avg_age'] > 50:
            name = name + " (Older)"
        else:
            name = name + " (Newer)"
    seen[c] = name
    cluster_names[c] = name

seg_df['cluster_name'] = seg_df['cluster'].map(cluster_names)

for _, row in profiles_df.iterrows():
    c = int(row['cluster'])
    print(f"\n  Cluster {c}: {cluster_names[c]}")
    print(f"    Count: {row['count']}")
    print(f"    Avg Price: EUR {row['avg_price']:,.0f}")
    print(f"    Avg Length: {row['avg_length']:.1f}m")
    print(f"    Avg Tonnage: {row['avg_tonnage']:,.0f}")
    print(f"    Avg Age: {row['avg_age']:.0f} years")
    print(f"    Avg Engine Hours: {row['avg_engine_hours']:,.0f}" if not pd.isna(row['avg_engine_hours']) else "    Avg Engine Hours: N/A")
    print(f"    Dominant Type: {row['dominant_type']} ({row['type_pct']:.0f}%)")

# PCA for 2D visualization
pca = PCA(n_components=2)
X_pca = pca.fit_transform(X_seg)
explained = pca.explained_variance_ratio_

fig, ax = plt.subplots(figsize=(12, 8))
for c in range(optimal_k):
    mask = seg_df['cluster'] == c
    ax.scatter(X_pca[mask, 0], X_pca[mask, 1],
              label=f'{cluster_names[c]} (n={mask.sum()})',
              alpha=0.6, color=COLORS[c % len(COLORS)], s=50,
              edgecolors='white', linewidth=0.5)

ax.set_xlabel(f'PC1 ({explained[0]*100:.1f}% variance)')
ax.set_ylabel(f'PC2 ({explained[1]*100:.1f}% variance)')
ax.set_title(f'Market Segments (K-Means, k={optimal_k}, n={len(seg_df)})')
ax.legend(loc='best', fontsize=8)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/market_segments.png')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/market_segments.png")

# Also plot length vs price with clusters
fig, ax = plt.subplots(figsize=(12, 8))
for c in range(optimal_k):
    mask = seg_df['cluster'] == c
    subset = seg_df[mask]
    ax.scatter(subset['length_m'], subset['price'] / 1e6,
              label=f'{cluster_names[c]} (n={mask.sum()})',
              alpha=0.6, color=COLORS[c % len(COLORS)], s=50,
              edgecolors='white', linewidth=0.5)

ax.set_xlabel('Length (m)')
ax.set_ylabel('Price (EUR millions)')
ax.set_title(f'Market Segments: Length vs Price (k={optimal_k}, n={len(seg_df)})')
ax.legend(loc='upper left', fontsize=8)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/market_segments_length_price.png')
plt.close()
print(f"Saved: {CHARTS_DIR}/market_segments_length_price.png")

# =============================================================================
# 5. BROKER PRICING ANALYSIS
# =============================================================================
print("\n" + "=" * 70)
print("5. BROKER PRICING ANALYSIS")
print("=" * 70)

# Check for vessels on multiple brokers via canonical_vessel_id
dup_df = df_all.dropna(subset=['canonical_vessel_id'])
print(f"\nVessels with canonical_vessel_id: {len(dup_df)}")

if len(dup_df) > 0:
    # Find canonical IDs that appear more than once
    dup_counts = dup_df['canonical_vessel_id'].value_counts()
    multi_broker = dup_counts[dup_counts > 1]
    print(f"Vessels listed on multiple brokers: {len(multi_broker)}")

    if len(multi_broker) > 0:
        # Compare prices for multi-listed vessels
        comparisons = []
        for cid in multi_broker.index:
            listings = dup_df[dup_df['canonical_vessel_id'] == cid]
            if listings['price'].notna().sum() >= 2:
                for _, row in listings.iterrows():
                    comparisons.append({
                        'canonical_id': cid,
                        'name': row['name'],
                        'source': row['source'],
                        'price': row['price'],
                    })

        comp_df = pd.DataFrame(comparisons)
        if len(comp_df) > 0:
            print(f"\nMulti-broker price comparisons ({len(comp_df)} listings):")
            for cid in comp_df['canonical_id'].unique():
                subset = comp_df[comp_df['canonical_id'] == cid]
                print(f"\n  {subset.iloc[0]['name']}:")
                for _, row in subset.iterrows():
                    print(f"    {row['source']:20s}: EUR {row['price']:>12,.0f}")

            # Average price by source for multi-listed vessels
            avg_by_source = comp_df.groupby('source')['price'].agg(['mean', 'count'])
            print(f"\nAverage price by source (multi-listed vessels only):")
            for src, row in avg_by_source.iterrows():
                print(f"  {src:20s}: EUR {row['mean']:>12,.0f}  (n={int(row['count'])})")
        else:
            print("  No vessels with prices on multiple brokers")
    else:
        print("  No vessels found on multiple brokers")
else:
    print("  No canonical_vessel_id data available")

# Overall broker pricing comparison (all vessels)
print("\nOverall broker pricing comparison:")
broker_stats = df_clean.groupby('source')['price'].agg(['mean', 'median', 'std', 'count'])
broker_stats = broker_stats.sort_values('median', ascending=False)
for src, row in broker_stats.iterrows():
    print(f"  {src:20s}: median EUR {row['median']:>12,.0f} | "
          f"mean EUR {row['mean']:>12,.0f} | std EUR {row['std']:>12,.0f} | n={int(row['count'])}")

# Chart
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Box plot
sources_ordered = broker_stats.index.tolist()
data_for_box = [df_clean[df_clean['source'] == s]['price'].dropna() / 1e6 for s in sources_ordered]
bp = axes[0].boxplot(data_for_box, labels=sources_ordered, patch_artist=True)
for i, patch in enumerate(bp['boxes']):
    patch.set_facecolor(COLORS[i % len(COLORS)])
    patch.set_alpha(0.7)
axes[0].set_ylabel('Price (EUR millions)')
axes[0].set_title('Price Distribution by Broker')
axes[0].tick_params(axis='x', rotation=30)
axes[0].grid(True, alpha=0.3, axis='y')

# Median bar chart
axes[1].bar(range(len(sources_ordered)),
            [broker_stats.loc[s, 'median'] / 1e6 for s in sources_ordered],
            color=[COLORS[i % len(COLORS)] for i in range(len(sources_ordered))],
            alpha=0.7)
axes[1].set_xticks(range(len(sources_ordered)))
axes[1].set_xticklabels(sources_ordered, rotation=30)
axes[1].set_ylabel('Median Price (EUR millions)')
axes[1].set_title('Median Price by Broker')
axes[1].grid(True, alpha=0.3, axis='y')

# Add count labels
for i, s in enumerate(sources_ordered):
    n = int(broker_stats.loc[s, 'count'])
    axes[1].text(i, broker_stats.loc[s, 'median'] / 1e6 + 0.02,
                f'n={n}', ha='center', va='bottom', fontsize=8)

plt.suptitle(f'Broker Pricing Comparison (n={len(df_clean)})', y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/broker_pricing.png', bbox_inches='tight')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/broker_pricing.png")

# =============================================================================
# 6. DEAL SCORE FORMULA
# =============================================================================
print("\n" + "=" * 70)
print("6. DEAL SCORE FORMULA")
print("=" * 70)

deal_features = ['length_m', 'tonnage', 'build_year']
deal_df = df_clean[deal_features + ['price', 'name', 'type']].dropna()
print(f"\nSample size for linear model: {len(deal_df)}")

X_deal = deal_df[deal_features]
y_deal = deal_df['price']

lr = LinearRegression()
lr.fit(X_deal, y_deal)
r2_train = lr.score(X_deal, y_deal)

# Cross-validation
cv_scores_lr = cross_val_score(lr, X_deal, y_deal, cv=5, scoring='r2')

print(f"\nLinear Regression: expected_price = a*length_m + b*tonnage + c*build_year + d")
print(f"\nCoefficients:")
print(f"  length_m:   {lr.coef_[0]:>12,.2f}")
print(f"  tonnage:    {lr.coef_[1]:>12,.2f}")
print(f"  build_year: {lr.coef_[2]:>12,.2f}")
print(f"  intercept:  {lr.intercept_:>12,.2f}")
print(f"\nR² (train): {r2_train:.4f}")
print(f"R² (5-fold CV): {cv_scores_lr.mean():.4f} +/- {cv_scores_lr.std():.4f}")

# Residual analysis
deal_df['predicted'] = lr.predict(X_deal)
deal_df['residual'] = deal_df['price'] - deal_df['predicted']
deal_df['residual_pct'] = deal_df['residual'] / deal_df['predicted'] * 100

print(f"\nResidual analysis:")
print(f"  Mean residual: EUR {deal_df['residual'].mean():,.0f}")
print(f"  Std residual: EUR {deal_df['residual'].std():,.0f}")
print(f"  Mean absolute error: EUR {deal_df['residual'].abs().mean():,.0f}")
print(f"  Median absolute error: EUR {deal_df['residual'].abs().median():,.0f}")
print(f"  Residual % (mean): {deal_df['residual_pct'].mean():.1f}%")
print(f"  Residual % (median): {deal_df['residual_pct'].median():.1f}%")

# Compare to percentile method (deal_score in current frontend)
# Current approach: percentile-based within type
# Linear model: regression-based across all types
deal_df['deal_pct'] = deal_df.groupby('type')['price'].rank(pct=True) * 100
deal_df['model_score'] = ((deal_df['predicted'] - deal_df['price']) / deal_df['predicted'] * 100).clip(-50, 50)

# How many vessels would be reclassified as "good deal" (model says underpriced but percentile says average)?
# Define: model says underpriced = residual < -10%, percentile says average = 30th-70th percentile
model_underpriced = deal_df['residual_pct'] < -20
percentile_average = (deal_df['deal_pct'] > 30) & (deal_df['deal_pct'] < 70)
reclassified = (model_underpriced & percentile_average).sum()
print(f"\nReclassification comparison:")
print(f"  Model says underpriced (>20% below expected) but percentile says average: {reclassified} vessels ({reclassified/len(deal_df)*100:.1f}%)")

# Top deals according to the linear model
print(f"\nTop 10 deals (most underpriced vs model prediction):")
top_deals = deal_df.nsmallest(10, 'residual_pct')
for _, row in top_deals.iterrows():
    print(f"  {row['name']:25s} | {row['type']:25s} | "
          f"Price: EUR {row['price']:>10,.0f} | "
          f"Expected: EUR {row['predicted']:>10,.0f} | "
          f"Gap: {row['residual_pct']:>+.0f}%")

# TypeScript-ready formula
print(f"\n--- TypeScript Formula ---")
print(f"function expectedPrice(length_m: number, tonnage: number, build_year: number): number {{")
print(f"  return {lr.coef_[0]:.2f} * length_m + {lr.coef_[1]:.2f} * tonnage + {lr.coef_[2]:.2f} * build_year + ({lr.intercept_:.2f});")
print(f"}}")

# =============================================================================
# 7. PRICE-PER-TON AND PRICE-PER-METER BY TYPE
# =============================================================================
print("\n" + "=" * 70)
print("7. PRICE METRICS BY TYPE")
print("=" * 70)

# Only types with at least 5 vessels
type_counts = df_clean['type'].value_counts()
types_min5 = type_counts[type_counts >= 5].index.tolist()
metric_df = df_clean[df_clean['type'].isin(types_min5)].copy()

print(f"\nTypes with >= 5 vessels: {len(types_min5)}")
for t in types_min5:
    n_ppt = metric_df[(metric_df['type'] == t) & metric_df['price_per_ton'].notna()].shape[0]
    n_ppm = metric_df[(metric_df['type'] == t) & metric_df['price_per_meter'].notna()].shape[0]
    print(f"  {t}: price_per_ton n={n_ppt}, price_per_meter n={n_ppm}")

# Coefficient of variation to determine which metric is more consistent per type
print(f"\nCoefficient of Variation by Type (lower = more consistent metric):")
for t in types_min5:
    t_df = metric_df[metric_df['type'] == t]
    ppt = t_df['price_per_ton'].dropna()
    ppm = t_df['price_per_meter'].dropna()
    cv_ppt = ppt.std() / ppt.mean() if len(ppt) > 1 and ppt.mean() > 0 else float('nan')
    cv_ppm = ppm.std() / ppm.mean() if len(ppm) > 1 and ppm.mean() > 0 else float('nan')
    better = "price_per_ton" if cv_ppt < cv_ppm else "price_per_meter"
    print(f"  {t:30s}: CV(per_ton)={cv_ppt:.2f}, CV(per_meter)={cv_ppm:.2f} -> {better} more consistent")

fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# Price per meter by type
data_ppm = [metric_df[metric_df['type'] == t]['price_per_meter'].dropna() for t in types_min5]
bp1 = axes[0].boxplot(data_ppm, labels=[t[:20] for t in types_min5], patch_artist=True, vert=True)
for i, patch in enumerate(bp1['boxes']):
    patch.set_facecolor(COLORS[i % len(COLORS)])
    patch.set_alpha(0.7)
axes[0].set_ylabel('Price per Meter (EUR/m)')
axes[0].set_title('Price per Meter by Vessel Type')
axes[0].tick_params(axis='x', rotation=45)
axes[0].grid(True, alpha=0.3, axis='y')

# Price per ton by type
data_ppt = [metric_df[metric_df['type'] == t]['price_per_ton'].dropna() for t in types_min5]
bp2 = axes[1].boxplot(data_ppt, labels=[t[:20] for t in types_min5], patch_artist=True, vert=True)
for i, patch in enumerate(bp2['boxes']):
    patch.set_facecolor(COLORS[i % len(COLORS)])
    patch.set_alpha(0.7)
axes[1].set_ylabel('Price per Ton (EUR/ton)')
axes[1].set_title('Price per Ton by Vessel Type')
axes[1].tick_params(axis='x', rotation=45)
axes[1].grid(True, alpha=0.3, axis='y')

plt.suptitle(f'Price Metrics by Vessel Type (types with n >= 5)', y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/price_metrics_by_type.png', bbox_inches='tight')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/price_metrics_by_type.png")

# =============================================================================
# 8. TIME-ON-MARKET ANALYSIS
# =============================================================================
print("\n" + "=" * 70)
print("8. TIME-ON-MARKET ANALYSIS")
print("=" * 70)

tom_df = df_clean.dropna(subset=['days_on_market'])
print(f"\nVessels with days_on_market: {len(tom_df)}")
print(f"Days on market range: {tom_df['days_on_market'].min():.0f} to {tom_df['days_on_market'].max():.0f}")
print(f"Mean: {tom_df['days_on_market'].mean():.0f}, Median: {tom_df['days_on_market'].median():.0f}")

# Check if days_on_market has variation
unique_dom = tom_df['days_on_market'].nunique()
print(f"Unique values: {unique_dom}")

if unique_dom <= 3:
    print("\n*** NOTE: days_on_market has very little variation (likely all scraped at same time). ***")
    print("*** Time-on-market analysis will be limited. ***")

    # Still show what we can
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Distribution of days on market
    axes[0].hist(tom_df['days_on_market'], bins=min(20, unique_dom),
                color=COLORS[0], alpha=0.7, edgecolor='white')
    axes[0].set_xlabel('Days on Market')
    axes[0].set_ylabel('Count')
    axes[0].set_title(f'Days on Market Distribution (n={len(tom_df)})')
    axes[0].grid(True, alpha=0.3, axis='y')

    # By type
    type_dom = tom_df.groupby('type')['days_on_market'].agg(['mean', 'median', 'count'])
    type_dom = type_dom[type_dom['count'] >= 5].sort_values('median')

    axes[1].barh(range(len(type_dom)), type_dom['median'],
                color=[COLORS[i % len(COLORS)] for i in range(len(type_dom))], alpha=0.7)
    axes[1].set_yticks(range(len(type_dom)))
    axes[1].set_yticklabels(type_dom.index)
    axes[1].set_xlabel('Median Days on Market')
    axes[1].set_title('Median Days on Market by Type')
    axes[1].grid(True, alpha=0.3, axis='x')

    for i, (_, row) in enumerate(type_dom.iterrows()):
        axes[1].text(row['median'] + 0.5, i, f'n={int(row["count"])}', va='center', fontsize=8)

    plt.suptitle('Time-on-Market Analysis', y=1.02)
    plt.tight_layout()
    plt.savefig(f'{CHARTS_DIR}/time_on_market.png', bbox_inches='tight')
    plt.close()
    print(f"Saved: {CHARTS_DIR}/time_on_market.png")

else:
    # Full time-on-market analysis with variation
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # Distribution
    axes[0, 0].hist(tom_df['days_on_market'], bins=30, color=COLORS[0], alpha=0.7, edgecolor='white')
    axes[0, 0].set_xlabel('Days on Market')
    axes[0, 0].set_ylabel('Count')
    axes[0, 0].set_title(f'Days on Market Distribution (n={len(tom_df)})')
    axes[0, 0].grid(True, alpha=0.3)

    # By type
    type_dom = tom_df.groupby('type')['days_on_market'].agg(['mean', 'median', 'count'])
    type_dom = type_dom[type_dom['count'] >= 5].sort_values('median')

    axes[0, 1].barh(range(len(type_dom)), type_dom['median'],
                    color=[COLORS[i % len(COLORS)] for i in range(len(type_dom))], alpha=0.7)
    axes[0, 1].set_yticks(range(len(type_dom)))
    axes[0, 1].set_yticklabels(type_dom.index)
    axes[0, 1].set_xlabel('Median Days on Market')
    axes[0, 1].set_title('Median Days on Market by Type')
    axes[0, 1].grid(True, alpha=0.3)

    # Scatter: days_on_market vs price
    axes[1, 0].scatter(tom_df['days_on_market'], tom_df['price'] / 1e6,
                       alpha=0.4, color=COLORS[0], s=30)
    axes[1, 0].set_xlabel('Days on Market')
    axes[1, 0].set_ylabel('Price (EUR millions)')
    axes[1, 0].set_title('Days on Market vs Price')
    axes[1, 0].grid(True, alpha=0.3)

    corr_dom_price = tom_df[['days_on_market', 'price']].corr().iloc[0, 1]
    axes[1, 0].text(0.05, 0.95, f'r = {corr_dom_price:.3f}',
                   transform=axes[1, 0].transAxes, fontsize=10, va='top')

    # By segment (if we have clusters)
    if 'cluster' in seg_df.columns:
        merged = tom_df.merge(seg_df[['name', 'cluster_name']].drop_duplicates(), on='name', how='left')
        seg_dom = merged.dropna(subset=['cluster_name']).groupby('cluster_name')['days_on_market'].agg(['mean', 'median', 'count'])
        seg_dom = seg_dom[seg_dom['count'] >= 3].sort_values('median')

        axes[1, 1].barh(range(len(seg_dom)), seg_dom['median'],
                        color=[COLORS[i % len(COLORS)] for i in range(len(seg_dom))], alpha=0.7)
        axes[1, 1].set_yticks(range(len(seg_dom)))
        axes[1, 1].set_yticklabels(seg_dom.index, fontsize=8)
        axes[1, 1].set_xlabel('Median Days on Market')
        axes[1, 1].set_title('Median Days on Market by Segment')
        axes[1, 1].grid(True, alpha=0.3)
    else:
        axes[1, 1].text(0.5, 0.5, 'No segment data', ha='center', va='center')

    plt.suptitle('Time-on-Market Analysis', y=1.02)
    plt.tight_layout()
    plt.savefig(f'{CHARTS_DIR}/time_on_market.png', bbox_inches='tight')
    plt.close()
    print(f"Saved: {CHARTS_DIR}/time_on_market.png")

    # Correlation between days on market and price
    print(f"\nCorrelation (days_on_market, price): {corr_dom_price:.3f}")

# Type-level stats
print(f"\nDays on market by type (types with n >= 5):")
type_dom_all = tom_df.groupby('type')['days_on_market'].agg(['mean', 'median', 'std', 'count'])
type_dom_all = type_dom_all[type_dom_all['count'] >= 5].sort_values('median')
for t, row in type_dom_all.iterrows():
    print(f"  {t:30s}: median {row['median']:>6.0f}d | mean {row['mean']:>6.0f}d | n={int(row['count'])}")


# =============================================================================
# SUMMARY
# =============================================================================
print("\n" + "=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)
print(f"\nCharts saved to: {CHARTS_DIR}/")
print(f"  - correlation_heatmap.png")
print(f"  - feature_importance.png")
print(f"  - engine_hours_vs_price.png")
print(f"  - elbow_plot.png")
print(f"  - market_segments.png")
print(f"  - market_segments_length_price.png")
print(f"  - broker_pricing.png")
print(f"  - price_metrics_by_type.png")
print(f"  - time_on_market.png")
