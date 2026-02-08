"""
Per-Type Price Analysis for Binnenvaart Intel (v2)
Runs regression, segmentation, and deal score per ship type instead of pooled.
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
import warnings
warnings.filterwarnings('ignore')

CHARTS_DIR = '/Users/dylanstrijker/binnenvaart-intel/analysis/charts'
DATA_PATH = '/Users/dylanstrijker/binnenvaart-intel/analysis/extracted_data_priced.csv'

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
print("PER-TYPE PRICE ANALYSIS")
print("=" * 70)

df = pd.read_csv(DATA_PATH)
df['is_outlier'] = df['is_outlier'].map({'True': True, 'False': False, True: True, False: False})
df_clean = df[df['is_outlier'] == False].copy()

print(f"Clean dataset: {len(df_clean)} vessels")
print(f"\nType distribution:")
print(df_clean['type'].value_counts().to_string())

# Types eligible for per-type modeling (n >= 15)
MODEL_TYPES = ['Motorvrachtschip', 'Tankschip', 'Beunschip', 'Duw/Sleepboot',
               'Duwbak', 'Koppelverband']

# =============================================================================
# 1. PER-TYPE REGRESSION MODELS
# =============================================================================
print("\n" + "=" * 70)
print("1. PER-TYPE REGRESSION MODELS")
print("=" * 70)

type_results = {}

# --- Motorvrachtschip: GBM with full features ---
print("\n--- Motorvrachtschip (GBM) ---")
mvs = df_clean[df_clean['type'] == 'Motorvrachtschip'].copy()
mvs_features = ['length_m', 'tonnage', 'build_year', 'engine_hours', 'engine_power_hp']
mvs_model_df = mvs[mvs_features + ['price', 'name']].dropna(subset=mvs_features + ['price'])
print(f"Sample size: {len(mvs_model_df)} (of {len(mvs)} total)")

X_mvs = mvs_model_df[mvs_features]
y_mvs = mvs_model_df['price']

gbr_mvs = GradientBoostingRegressor(
    n_estimators=200, max_depth=4, learning_rate=0.05,
    min_samples_leaf=8, subsample=0.8, random_state=42
)
cv_mvs = cross_val_score(gbr_mvs, X_mvs, y_mvs, cv=5, scoring='r2')
gbr_mvs.fit(X_mvs, y_mvs)
train_r2_mvs = gbr_mvs.score(X_mvs, y_mvs)

print(f"5-Fold CV R²: {cv_mvs.mean():.4f} +/- {cv_mvs.std():.4f}")
print(f"Train R²: {train_r2_mvs:.4f}")

importances_mvs = pd.Series(gbr_mvs.feature_importances_, index=mvs_features)
importances_mvs = importances_mvs.sort_values(ascending=False)
print("Feature importance:")
for feat, imp in importances_mvs.items():
    print(f"  {feat:20s}: {imp:.4f}")

type_results['Motorvrachtschip'] = {
    'model_type': 'GBM',
    'n': len(mvs_model_df),
    'n_total': len(mvs),
    'r2_cv': cv_mvs.mean(),
    'r2_cv_std': cv_mvs.std(),
    'r2_train': train_r2_mvs,
    'features': mvs_features,
    'importances': importances_mvs.to_dict(),
    'model': gbr_mvs,
}

# --- Linear regression for other types ---
linear_type_configs = {
    'Tankschip': ['length_m', 'tonnage', 'build_year'],
    'Beunschip': ['length_m', 'tonnage', 'build_year'],
    'Duw/Sleepboot': ['length_m', 'build_year'],  # only 6 have tonnage
    'Duwbak': ['length_m', 'tonnage', 'build_year'],
    'Koppelverband': ['length_m', 'tonnage', 'build_year'],
}

for vtype, features in linear_type_configs.items():
    print(f"\n--- {vtype} (Linear) ---")
    type_df = df_clean[df_clean['type'] == vtype].copy()
    model_df = type_df[features + ['price', 'name']].dropna(subset=features + ['price'])
    print(f"Sample size: {len(model_df)} (of {len(type_df)} total)")

    if len(model_df) < 10:
        print(f"  SKIPPED: n={len(model_df)} too small for reliable regression")
        type_results[vtype] = {
            'model_type': 'Linear',
            'n': len(model_df),
            'n_total': len(type_df),
            'r2_cv': None,
            'r2_cv_std': None,
            'r2_train': None,
            'features': features,
            'importances': {},
            'model': None,
            'skipped': True,
        }
        continue

    X_type = model_df[features]
    y_type = model_df['price']

    lr = LinearRegression()
    n_folds = min(5, len(model_df) // 3)  # ensure at least 3 per fold
    if n_folds < 2:
        n_folds = 2
    cv_scores = cross_val_score(lr, X_type, y_type, cv=n_folds, scoring='r2')
    lr.fit(X_type, y_type)
    train_r2 = lr.score(X_type, y_type)

    print(f"{n_folds}-Fold CV R²: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
    print(f"Train R²: {train_r2:.4f}")
    print("Coefficients:")
    coef_dict = {}
    for feat, coef in zip(features, lr.coef_):
        print(f"  {feat:20s}: {coef:>12,.2f}")
        coef_dict[feat] = coef
    print(f"  {'intercept':20s}: {lr.intercept_:>12,.2f}")
    coef_dict['intercept'] = lr.intercept_

    type_results[vtype] = {
        'model_type': 'Linear',
        'n': len(model_df),
        'n_total': len(type_df),
        'r2_cv': cv_scores.mean(),
        'r2_cv_std': cv_scores.std(),
        'r2_train': train_r2,
        'features': features,
        'coefficients': coef_dict,
        'model': lr,
    }

# --- Pooled model for comparison ---
print("\n--- Pooled Model (all types, Linear) ---")
pooled_features = ['length_m', 'tonnage', 'build_year']
pooled_df = df_clean[pooled_features + ['price', 'type']].dropna(subset=pooled_features + ['price'])
X_pooled = pooled_df[pooled_features]
y_pooled = pooled_df['price']
lr_pooled = LinearRegression()
cv_pooled = cross_val_score(lr_pooled, X_pooled, y_pooled, cv=5, scoring='r2')
lr_pooled.fit(X_pooled, y_pooled)
print(f"Sample size: {len(pooled_df)}")
print(f"5-Fold CV R²: {cv_pooled.mean():.4f} +/- {cv_pooled.std():.4f}")
print(f"Train R²: {lr_pooled.score(X_pooled, y_pooled):.4f}")

pooled_r2 = cv_pooled.mean()

# =============================================================================
# CHART 1: Per-Type Feature Importance
# =============================================================================
print("\n--- Generating per_type_feature_importance.png ---")

# Collect data for chart
chart_types = [t for t in MODEL_TYPES if t in type_results and type_results[t].get('r2_cv') is not None]

fig, axes = plt.subplots(2, 3, figsize=(18, 11))
axes = axes.flatten()

for i, vtype in enumerate(chart_types):
    ax = axes[i]
    res = type_results[vtype]

    if res['model_type'] == 'GBM':
        # Feature importance from GBM
        imp = pd.Series(res['importances']).sort_values(ascending=True)
        bars = ax.barh(range(len(imp)), imp.values, color=COLORS[i % len(COLORS)], alpha=0.8)
        ax.set_yticks(range(len(imp)))
        ax.set_yticklabels(imp.index, fontsize=8)
        ax.set_xlabel('Importance (Gini)')
    else:
        # Absolute coefficients (normalized) for linear models
        coefs = {k: v for k, v in res['coefficients'].items() if k != 'intercept'}
        # Standardize to show relative importance
        type_df_temp = df_clean[df_clean['type'] == vtype]
        std_coefs = {}
        for feat, coef in coefs.items():
            feat_std = type_df_temp[feat].dropna().std()
            if feat_std > 0:
                std_coefs[feat] = abs(coef * feat_std)
            else:
                std_coefs[feat] = 0
        total = sum(std_coefs.values())
        if total > 0:
            std_coefs = {k: v / total for k, v in std_coefs.items()}
        imp = pd.Series(std_coefs).sort_values(ascending=True)
        bars = ax.barh(range(len(imp)), imp.values, color=COLORS[i % len(COLORS)], alpha=0.8)
        ax.set_yticks(range(len(imp)))
        ax.set_yticklabels(imp.index, fontsize=8)
        ax.set_xlabel('Relative Importance (standardized)')

    r2_str = f"{res['r2_cv']:.3f}" if res['r2_cv'] is not None else "N/A"
    ax.set_title(f"{vtype}\nCV R²={r2_str} | n={res['n']} | {res['model_type']}", fontsize=10)
    ax.grid(True, alpha=0.3, axis='x')

# Hide unused axes
for j in range(len(chart_types), len(axes)):
    axes[j].set_visible(False)

plt.suptitle(f'Per-Type Feature Importance\n(Pooled model CV R²={pooled_r2:.3f} for comparison)',
             fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/per_type_feature_importance.png', bbox_inches='tight')
plt.close()
print(f"Saved: {CHARTS_DIR}/per_type_feature_importance.png")


# =============================================================================
# 2. PER-TYPE ENGINE HOURS IMPACT
# =============================================================================
print("\n" + "=" * 70)
print("2. PER-TYPE ENGINE HOURS IMPACT")
print("=" * 70)

# Motorvrachtschip engine hours analysis
mvs_eh = df_clean[(df_clean['type'] == 'Motorvrachtschip')].dropna(subset=['engine_hours', 'price'])
tank_eh = df_clean[(df_clean['type'] == 'Tankschip')].dropna(subset=['engine_hours', 'price'])

print(f"\nMotorvrachtschip with engine hours + price: {len(mvs_eh)}")
print(f"Tankschip with engine hours + price: {len(tank_eh)}")

# Partial dependence for Motorvrachtschip (from the GBM model)
eh_col_idx = mvs_features.index('engine_hours')
pd_result_mvs = partial_dependence(gbr_mvs, X_mvs, features=[eh_col_idx],
                                     kind='average', grid_resolution=20)
if hasattr(pd_result_mvs, 'grid_values'):
    eh_vals_mvs = pd_result_mvs['grid_values'][0]
else:
    eh_vals_mvs = pd_result_mvs['values'][0]
eh_pdp_mvs = pd_result_mvs['average'][0]

eh_range_mvs = eh_vals_mvs[-1] - eh_vals_mvs[0]
pdp_range_mvs = eh_pdp_mvs[-1] - eh_pdp_mvs[0]
price_per_10k_mvs = (pdp_range_mvs / eh_range_mvs) * 10000
print(f"\nMotorvrachtschip: 10,000 engine hours effect = {price_per_10k_mvs:,.0f} EUR")

# For Tankschip: simple linear regression controlling for size/age
if len(tank_eh) >= 10:
    tank_ctrl_features = ['length_m', 'tonnage', 'build_year', 'engine_hours']
    tank_ctrl_df = tank_eh[tank_ctrl_features + ['price']].dropna()
    if len(tank_ctrl_df) >= 8:
        lr_tank_eh = LinearRegression()
        lr_tank_eh.fit(tank_ctrl_df[tank_ctrl_features], tank_ctrl_df['price'])
        eh_coef_tank = lr_tank_eh.coef_[tank_ctrl_features.index('engine_hours')]
        price_per_10k_tank = eh_coef_tank * 10000
        print(f"Tankschip: 10,000 engine hours effect = {price_per_10k_tank:,.0f} EUR (linear, n={len(tank_ctrl_df)})")
    else:
        price_per_10k_tank = None
        print(f"Tankschip: insufficient data for controlled analysis (n={len(tank_ctrl_df)})")
else:
    price_per_10k_tank = None
    print(f"Tankschip: insufficient data (n={len(tank_eh)})")

# Chart: Engine Hours by Type
fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# Left: Motorvrachtschip scatter + PDP
ax1 = axes[0]
scatter_mvs = mvs_eh.dropna(subset=['engine_hours', 'price', 'length_m'])
sizes = (scatter_mvs['length_m'] / scatter_mvs['length_m'].max() * 100).clip(10, 200)
sc = ax1.scatter(scatter_mvs['engine_hours'], scatter_mvs['price'] / 1e6,
                 c=scatter_mvs['build_year'], cmap='RdYlGn', alpha=0.6,
                 s=sizes, edgecolors='white', linewidth=0.5)
plt.colorbar(sc, ax=ax1, label='Build Year', shrink=0.8)

# Add PDP line on secondary axis
ax1_twin = ax1.twinx()
ax1_twin.plot(eh_vals_mvs, eh_pdp_mvs / 1e6, 'r-', linewidth=2.5, alpha=0.8,
              label='Partial Dependence')
ax1_twin.set_ylabel('Partial Dependence (EUR M)', color='red', fontsize=9)
ax1_twin.tick_params(axis='y', labelcolor='red')

ax1.set_xlabel('Engine Hours')
ax1.set_ylabel('Price (EUR millions)')
ax1.set_title(f'Motorvrachtschip: Engine Hours vs Price (n={len(mvs_eh)})\n'
              f'PDP: {price_per_10k_mvs:+,.0f} EUR per 10K hours')
ax1.grid(True, alpha=0.3)

# Right: Tankschip scatter
ax2 = axes[1]
if len(tank_eh) >= 5:
    scatter_tank = tank_eh.dropna(subset=['engine_hours', 'price'])
    has_by = scatter_tank['build_year'].notna()
    if has_by.sum() > 0:
        sc2 = ax2.scatter(scatter_tank.loc[has_by, 'engine_hours'],
                          scatter_tank.loc[has_by, 'price'] / 1e6,
                          c=scatter_tank.loc[has_by, 'build_year'],
                          cmap='RdYlGn', alpha=0.7, s=60, edgecolors='white', linewidth=0.5)
        plt.colorbar(sc2, ax=ax2, label='Build Year', shrink=0.8)
    if (~has_by).sum() > 0:
        ax2.scatter(scatter_tank.loc[~has_by, 'engine_hours'],
                    scatter_tank.loc[~has_by, 'price'] / 1e6,
                    color='grey', alpha=0.5, s=40, label='No build year')
    tank_effect_str = f'{price_per_10k_tank:+,.0f} EUR per 10K hrs' if price_per_10k_tank else 'insufficient data'
    ax2.set_title(f'Tankschip: Engine Hours vs Price (n={len(tank_eh)})\n'
                  f'Effect: {tank_effect_str}')
else:
    ax2.text(0.5, 0.5, f'Tankschip: n={len(tank_eh)} (insufficient)', ha='center', va='center')
    ax2.set_title('Tankschip: Insufficient Data')

ax2.set_xlabel('Engine Hours')
ax2.set_ylabel('Price (EUR millions)')
ax2.grid(True, alpha=0.3)

plt.suptitle('Engine Hours Impact by Vessel Type', fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/engine_hours_by_type.png', bbox_inches='tight')
plt.close()
print(f"Saved: {CHARTS_DIR}/engine_hours_by_type.png")


# =============================================================================
# 3. TYPE-AWARE DEAL SCORE FORMULA
# =============================================================================
print("\n" + "=" * 70)
print("3. TYPE-AWARE DEAL SCORE FORMULA")
print("=" * 70)

# For each type with enough data, fit a linear model for deal scoring
deal_coefficients = {}

for vtype in MODEL_TYPES:
    type_df = df_clean[df_clean['type'] == vtype].copy()

    if vtype == 'Duw/Sleepboot':
        features = ['length_m', 'build_year']
    else:
        features = ['length_m', 'tonnage', 'build_year']

    model_df = type_df[features + ['price']].dropna()
    if len(model_df) < 10:
        print(f"\n{vtype}: SKIPPED for deal score (n={len(model_df)})")
        continue

    X = model_df[features]
    y = model_df['price']

    lr = LinearRegression()
    n_folds = min(5, len(model_df) // 3)
    if n_folds < 2:
        n_folds = 2
    cv = cross_val_score(lr, X, y, cv=n_folds, scoring='r2')
    lr.fit(X, y)

    coefs = {}
    for feat, c in zip(features, lr.coef_):
        coefs[feat] = round(c, 2)
    coefs['intercept'] = round(lr.intercept_, 2)

    deal_coefficients[vtype] = coefs

    print(f"\n{vtype} (n={len(model_df)}):")
    print(f"  CV R²: {cv.mean():.4f} +/- {cv.std():.4f}")
    print(f"  Coefficients: {coefs}")

# Also compute pooled deal score for fallback
pooled_deal_features = ['length_m', 'tonnage', 'build_year']
pooled_deal_df = df_clean[pooled_deal_features + ['price']].dropna()
lr_pooled_deal = LinearRegression()
lr_pooled_deal.fit(pooled_deal_df[pooled_deal_features], pooled_deal_df['price'])
pooled_coefs = {
    'length_m': round(lr_pooled_deal.coef_[0], 2),
    'tonnage': round(lr_pooled_deal.coef_[1], 2),
    'build_year': round(lr_pooled_deal.coef_[2], 2),
    'intercept': round(lr_pooled_deal.intercept_, 2),
}
deal_coefficients['_fallback'] = pooled_coefs
print(f"\nFallback (pooled, n={len(pooled_deal_df)}):")
print(f"  Coefficients: {pooled_coefs}")

# Print TypeScript implementation
print("\n--- TypeScript Type-Aware Deal Score ---")
print("const TYPE_COEFFICIENTS: Record<string, {length: number; tonnage: number; build_year: number; intercept: number}> = {")
for vtype, coefs in deal_coefficients.items():
    length = coefs.get('length_m', 0)
    tonnage = coefs.get('tonnage', 0)
    build_year = coefs.get('build_year', 0)
    intercept = coefs.get('intercept', 0)
    print(f"  '{vtype}': {{ length: {length}, tonnage: {tonnage}, build_year: {build_year}, intercept: {intercept} }},")
print("};")

# Compare type-aware vs pooled scores
print("\n--- Reclassification Analysis ---")
# For each vessel with enough data, compute both scores
reclass_data = []
for _, row in df_clean.iterrows():
    if pd.isna(row['price']) or pd.isna(row['length_m']) or pd.isna(row['build_year']):
        continue

    vtype = row['type']

    # Type-aware expected price
    if vtype in deal_coefficients:
        coefs = deal_coefficients[vtype]
    else:
        coefs = deal_coefficients['_fallback']

    type_expected = coefs.get('length_m', 0) * row['length_m']
    if 'tonnage' in coefs and coefs['tonnage'] != 0 and not pd.isna(row.get('tonnage', np.nan)):
        type_expected += coefs['tonnage'] * row['tonnage']
    type_expected += coefs.get('build_year', 0) * row['build_year']
    type_expected += coefs.get('intercept', 0)
    type_expected = max(0, type_expected)

    # Pooled expected price
    pooled_expected = pooled_coefs['length_m'] * row['length_m']
    if not pd.isna(row.get('tonnage', np.nan)):
        pooled_expected += pooled_coefs['tonnage'] * row['tonnage']
    pooled_expected += pooled_coefs['build_year'] * row['build_year']
    pooled_expected += pooled_coefs['intercept']
    pooled_expected = max(0, pooled_expected)

    if type_expected > 0 and pooled_expected > 0:
        type_pct = ((type_expected - row['price']) / type_expected) * 100
        pooled_pct = ((pooled_expected - row['price']) / pooled_expected) * 100

        # Classify into buckets
        def bucket(pct):
            if pct > 20: return 'good_deal'
            elif pct >= -20: return 'fair'
            else: return 'overpriced'

        reclass_data.append({
            'name': row['name'],
            'type': vtype,
            'price': row['price'],
            'type_score': type_pct,
            'pooled_score': pooled_pct,
            'type_bucket': bucket(type_pct),
            'pooled_bucket': bucket(pooled_pct),
        })

reclass_df = pd.DataFrame(reclass_data)
reclassified = (reclass_df['type_bucket'] != reclass_df['pooled_bucket']).sum()
total = len(reclass_df)
print(f"Total scored: {total}")
print(f"Reclassified (type-aware vs pooled): {reclassified} ({reclassified/total*100:.1f}%)")

# Breakdown of reclassifications
reclass_changes = reclass_df[reclass_df['type_bucket'] != reclass_df['pooled_bucket']]
if len(reclass_changes) > 0:
    print("\nReclassification breakdown:")
    changes = reclass_changes.groupby(['pooled_bucket', 'type_bucket']).size().reset_index(name='count')
    for _, row in changes.iterrows():
        print(f"  {row['pooled_bucket']:12s} -> {row['type_bucket']:12s}: {row['count']} vessels")

    # Show examples per type
    print("\nExamples of reclassified vessels:")
    for vtype in reclass_changes['type'].unique():
        subset = reclass_changes[reclass_changes['type'] == vtype].head(3)
        for _, row in subset.iterrows():
            print(f"  {row['name']:25s} | {row['type']:20s} | "
                  f"Pooled: {row['pooled_bucket']:12s} ({row['pooled_score']:+.0f}%) -> "
                  f"Type: {row['type_bucket']:12s} ({row['type_score']:+.0f}%)")


# =============================================================================
# 4. MOTORVRACHTSCHIP SEGMENTATION
# =============================================================================
print("\n" + "=" * 70)
print("4. MOTORVRACHTSCHIP SEGMENTATION")
print("=" * 70)

mvs_seg_features = ['length_m', 'tonnage', 'build_year', 'price']
mvs_seg = df_clean[df_clean['type'] == 'Motorvrachtschip'].copy()
mvs_seg = mvs_seg.dropna(subset=mvs_seg_features)
print(f"\nMotorvrachtschip for segmentation: {len(mvs_seg)}")

scaler = StandardScaler()
X_mvs_seg = scaler.fit_transform(mvs_seg[mvs_seg_features])

# Elbow method
inertias = []
k_range = range(3, 8)
for k in k_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_mvs_seg)
    inertias.append(km.inertia_)

# Second derivative for elbow
diffs = np.diff(inertias)
diffs2 = np.diff(diffs)
optimal_k_idx = np.argmax(diffs2) + 3
optimal_k = max(3, min(optimal_k_idx, 6))
print(f"Elbow suggests k={optimal_k_idx}, using k={optimal_k}")

km_mvs = KMeans(n_clusters=optimal_k, random_state=42, n_init=20)
mvs_seg['cluster'] = km_mvs.fit_predict(X_mvs_seg)

# Profile segments
print("\nMotorvrachtschip Segment Profiles:")
mvs_profiles = []
for c in range(optimal_k):
    cluster_data = mvs_seg[mvs_seg['cluster'] == c]
    profile = {
        'cluster': c,
        'count': len(cluster_data),
        'avg_price': cluster_data['price'].mean(),
        'med_price': cluster_data['price'].median(),
        'avg_length': cluster_data['length_m'].mean(),
        'avg_tonnage': cluster_data['tonnage'].mean(),
        'avg_age': cluster_data['vessel_age'].mean() if 'vessel_age' in cluster_data else None,
        'avg_build_year': cluster_data['build_year'].mean(),
        'avg_engine_hours': cluster_data['engine_hours'].mean(),
    }
    mvs_profiles.append(profile)

mvs_profiles_df = pd.DataFrame(mvs_profiles).sort_values('avg_price', ascending=False)

# Name segments
mvs_cluster_names = {}
for _, row in mvs_profiles_df.iterrows():
    c = row['cluster']
    price = row['avg_price']
    length = row['avg_length']
    age = row['avg_age'] if row['avg_age'] is not None else (2026 - row['avg_build_year'])

    if price > 3_000_000:
        name = "Modern Large Cargo"
    elif price > 1_500_000:
        name = "Mid-Market Haulers"
    elif price > 800_000:
        name = "Established Fleet"
    elif price > 400_000 and length > 70:
        name = "Classic Rhine Freighters"
    elif price > 300_000:
        name = "Working Classics"
    elif length < 55:
        name = "Small River Vessels"
    else:
        name = "Budget Workhorses"

    mvs_cluster_names[c] = name

# Deduplicate names
seen_names = {}
for c, name in mvs_cluster_names.items():
    if name in seen_names.values():
        row_data = mvs_profiles_df[mvs_profiles_df['cluster'] == c].iloc[0]
        name = name + f" ({row_data['avg_length']:.0f}m avg)"
    seen_names[c] = name
    mvs_cluster_names[c] = name

mvs_seg['cluster_name'] = mvs_seg['cluster'].map(mvs_cluster_names)

for _, row in mvs_profiles_df.iterrows():
    c = int(row['cluster'])
    age = row['avg_age'] if row['avg_age'] is not None else (2026 - row['avg_build_year'])
    print(f"\n  {mvs_cluster_names[c]}:")
    print(f"    Count: {row['count']}")
    print(f"    Avg Price: EUR {row['avg_price']:,.0f}")
    print(f"    Median Price: EUR {row['med_price']:,.0f}")
    print(f"    Avg Length: {row['avg_length']:.1f}m")
    print(f"    Avg Tonnage: {row['avg_tonnage']:,.0f}")
    print(f"    Avg Age: {age:.0f} years")
    eh_str = f"{row['avg_engine_hours']:,.0f}" if not pd.isna(row['avg_engine_hours']) else "N/A"
    print(f"    Avg Engine Hours: {eh_str}")

# Chart: Motorvrachtschip Segments
fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# Left: Length vs Price
ax1 = axes[0]
for c in range(optimal_k):
    mask = mvs_seg['cluster'] == c
    subset = mvs_seg[mask]
    ax1.scatter(subset['length_m'], subset['price'] / 1e6,
                label=f'{mvs_cluster_names[c]} (n={mask.sum()})',
                alpha=0.6, color=COLORS[c % len(COLORS)], s=50,
                edgecolors='white', linewidth=0.5)

ax1.set_xlabel('Length (m)')
ax1.set_ylabel('Price (EUR millions)')
ax1.set_title(f'Motorvrachtschip Segments: Length vs Price\n(k={optimal_k}, n={len(mvs_seg)})')
ax1.legend(loc='upper left', fontsize=7)
ax1.grid(True, alpha=0.3)

# Right: Tonnage vs Price
ax2 = axes[1]
for c in range(optimal_k):
    mask = mvs_seg['cluster'] == c
    subset = mvs_seg[mask]
    ax2.scatter(subset['tonnage'], subset['price'] / 1e6,
                label=f'{mvs_cluster_names[c]} (n={mask.sum()})',
                alpha=0.6, color=COLORS[c % len(COLORS)], s=50,
                edgecolors='white', linewidth=0.5)

ax2.set_xlabel('Tonnage (tons)')
ax2.set_ylabel('Price (EUR millions)')
ax2.set_title(f'Motorvrachtschip Segments: Tonnage vs Price\n(k={optimal_k}, n={len(mvs_seg)})')
ax2.legend(loc='upper left', fontsize=7)
ax2.grid(True, alpha=0.3)

plt.suptitle('Within-Type Segmentation: Motorvrachtschip', fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/motorvrachtschip_segments.png', bbox_inches='tight')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/motorvrachtschip_segments.png")


# =============================================================================
# 5. CROSS-TYPE COMPARISON
# =============================================================================
print("\n" + "=" * 70)
print("5. CROSS-TYPE COMPARISON")
print("=" * 70)

comparison_types = df_clean['type'].value_counts()
comparison_types = comparison_types[comparison_types >= 5].index.tolist()

comparison_data = []
for vtype in comparison_types:
    type_df = df_clean[df_clean['type'] == vtype]

    med_price = type_df['price'].median()
    med_ppt = type_df['price_per_ton'].median()
    med_ppm = type_df['price_per_meter'].median()

    # Per-type model R²
    if vtype in type_results and type_results[vtype].get('r2_cv') is not None:
        per_type_r2 = type_results[vtype]['r2_cv']
    else:
        per_type_r2 = None

    # Top price driver
    if vtype in type_results:
        res = type_results[vtype]
        if res['model_type'] == 'GBM' and 'importances' in res:
            top_driver = max(res['importances'], key=res['importances'].get)
        elif 'coefficients' in res:
            # Standardized coefficients
            coefs = {k: v for k, v in res['coefficients'].items() if k != 'intercept'}
            std_coefs = {}
            for feat, coef in coefs.items():
                feat_std = type_df[feat].dropna().std()
                if feat_std and feat_std > 0:
                    std_coefs[feat] = abs(coef * feat_std)
            top_driver = max(std_coefs, key=std_coefs.get) if std_coefs else 'N/A'
        else:
            top_driver = 'N/A'
    else:
        top_driver = 'N/A'

    # Engine hours effect
    eh_subset = type_df.dropna(subset=['engine_hours', 'price'])
    avg_eh_effect = None
    if vtype == 'Motorvrachtschip':
        avg_eh_effect = price_per_10k_mvs
    elif vtype == 'Tankschip' and price_per_10k_tank is not None:
        avg_eh_effect = price_per_10k_tank

    comparison_data.append({
        'type': vtype,
        'count': len(type_df),
        'median_price': med_price,
        'median_price_per_ton': med_ppt,
        'median_price_per_meter': med_ppm,
        'per_type_r2': per_type_r2,
        'pooled_r2': pooled_r2,
        'top_driver': top_driver,
        'eh_effect_10k': avg_eh_effect,
    })

comp_df = pd.DataFrame(comparison_data)

print("\nCross-Type Comparison:")
print(f"{'Type':25s} | {'n':>4s} | {'Med Price':>12s} | {'Med EUR/ton':>11s} | {'Med EUR/m':>10s} | {'Type R²':>7s} | {'Top Driver':>15s} | {'EH/10K':>10s}")
print("-" * 115)
for _, row in comp_df.iterrows():
    r2_str = f"{row['per_type_r2']:.3f}" if row['per_type_r2'] is not None else "N/A"
    ppt_str = f"{row['median_price_per_ton']:>11,.0f}" if not pd.isna(row['median_price_per_ton']) else "N/A"
    ppm_str = f"{row['median_price_per_meter']:>10,.0f}" if not pd.isna(row['median_price_per_meter']) else "N/A"
    eh_str = f"{row['eh_effect_10k']:>+10,.0f}" if row['eh_effect_10k'] is not None else "N/A"
    print(f"{row['type']:25s} | {row['count']:>4d} | EUR {row['median_price']:>9,.0f} | {ppt_str} | {ppm_str} | {r2_str:>7s} | {row['top_driver']:>15s} | {eh_str:>10s}")

# Chart: Type Comparison
fig, axes = plt.subplots(1, 3, figsize=(18, 7))

types_for_chart = comp_df['type'].tolist()
x = range(len(types_for_chart))

# Median Price
axes[0].bar(x, comp_df['median_price'] / 1e6,
            color=[COLORS[i % len(COLORS)] for i in x], alpha=0.8)
axes[0].set_xticks(list(x))
axes[0].set_xticklabels(types_for_chart, rotation=45, ha='right', fontsize=8)
axes[0].set_ylabel('Median Price (EUR M)')
axes[0].set_title('Median Price by Type')
axes[0].grid(True, alpha=0.3, axis='y')
for i, val in enumerate(comp_df['median_price']):
    axes[0].text(i, val / 1e6 + 0.02, f'n={comp_df.iloc[i]["count"]}',
                 ha='center', fontsize=7)

# Median Price per Ton
ppt_data = comp_df.dropna(subset=['median_price_per_ton'])
if len(ppt_data) > 0:
    x_ppt = range(len(ppt_data))
    axes[1].bar(x_ppt, ppt_data['median_price_per_ton'],
                color=[COLORS[i % len(COLORS)] for i in x_ppt], alpha=0.8)
    axes[1].set_xticks(list(x_ppt))
    axes[1].set_xticklabels(ppt_data['type'].tolist(), rotation=45, ha='right', fontsize=8)
    axes[1].set_ylabel('Median Price per Ton (EUR/t)')
    axes[1].set_title('Median Price per Ton by Type')
    axes[1].grid(True, alpha=0.3, axis='y')

# Median Price per Meter
ppm_data = comp_df.dropna(subset=['median_price_per_meter'])
if len(ppm_data) > 0:
    x_ppm = range(len(ppm_data))
    axes[2].bar(x_ppm, ppm_data['median_price_per_meter'],
                color=[COLORS[i % len(COLORS)] for i in x_ppm], alpha=0.8)
    axes[2].set_xticks(list(x_ppm))
    axes[2].set_xticklabels(ppm_data['type'].tolist(), rotation=45, ha='right', fontsize=8)
    axes[2].set_ylabel('Median Price per Meter (EUR/m)')
    axes[2].set_title('Median Price per Meter by Type')
    axes[2].grid(True, alpha=0.3, axis='y')

plt.suptitle('Cross-Type Price Comparison', fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/type_comparison.png', bbox_inches='tight')
plt.close()
print(f"\nSaved: {CHARTS_DIR}/type_comparison.png")


# =============================================================================
# SUMMARY
# =============================================================================
print("\n" + "=" * 70)
print("PER-TYPE ANALYSIS COMPLETE")
print("=" * 70)

print("\nPer-Type Model Summary:")
print(f"{'Type':25s} | {'Model':>6s} | {'n':>4s} | {'CV R²':>8s} | {'Pooled R²':>9s} | {'Improvement':>11s}")
print("-" * 80)
for vtype in MODEL_TYPES:
    if vtype in type_results:
        res = type_results[vtype]
        r2_str = f"{res['r2_cv']:.3f}" if res['r2_cv'] is not None else "N/A"
        r2_val = res['r2_cv'] if res['r2_cv'] is not None else 0
        diff = r2_val - pooled_r2
        diff_str = f"{diff:+.3f}" if res['r2_cv'] is not None else "N/A"
        print(f"{vtype:25s} | {res['model_type']:>6s} | {res['n']:>4d} | {r2_str:>8s} | {pooled_r2:>9.3f} | {diff_str:>11s}")

print(f"\nType-aware deal score coefficients:")
for vtype, coefs in deal_coefficients.items():
    print(f"  {vtype}: {coefs}")

print(f"\nReclassification: {reclassified}/{total} vessels ({reclassified/total*100:.1f}%) change bucket")

print(f"\nCharts saved:")
print(f"  - {CHARTS_DIR}/per_type_feature_importance.png")
print(f"  - {CHARTS_DIR}/engine_hours_by_type.png")
print(f"  - {CHARTS_DIR}/motorvrachtschip_segments.png")
print(f"  - {CHARTS_DIR}/type_comparison.png")
