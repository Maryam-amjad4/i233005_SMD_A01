/**
 * Flex++ — application shell and explicit conditional view switch.
 *
 * There is no navigation library, no router, no sidebar and no bottom bar.
 * Views are switched with a plain reducer (`navigationReducer`) plus explicit
 * conditional branches, exactly as taught in the class example: state and
 * props do the navigation.
 *
 * App owns:
 *   - the dataset and persistence (`useAppData`)
 *   - the view/history state (`useReducer` + `navigationReducer`)
 *   - the header (title, Back, Home) and the Android hardware Back handler
 *
 * Screens receive records, computed summaries and callbacks through props and
 * keep no global state of their own.
 */
import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useAppData } from './src/app/useAppData.js';
import { canGoBack, checkViewValidity, initialNavigation, navigationReducer } from './src/app/viewState.js';
import { Banner, Button, Status } from './src/ui/components.js';
import { colors, spacing } from './src/ui/theme.js';

import HomeScreen from './src/features/home/HomeScreen.js';
import CoursesScreen from './src/features/courses/CoursesScreen.js';
import CourseScreen from './src/features/courses/CourseScreen.js';
import HistoryScreen from './src/features/history/HistoryScreen.js';
import TasksScreen from './src/features/planning/TasksScreen.js';
import CalendarScreen from './src/features/planning/CalendarScreen.js';
import ScenariosScreen from './src/features/scenarios/ScenariosScreen.js';
import ScenarioEditor from './src/features/scenarios/ScenarioEditor.js';
import FinanceScreen from './src/features/finance/FinanceScreen.js';
import FeeDetailScreen from './src/features/finance/FeeDetailScreen.js';
import ProfileScreen from './src/features/profile/ProfileScreen.js';
import DemoDataScreen from './src/features/demo/DemoDataScreen.js';

/** Human-readable titles, used by the header and by assistive technology. */
const VIEW_TITLES = {
  home: 'Flex++',
  courses: 'Courses',
  course: 'Course workspace',
  history: 'Academic history',
  tasks: 'Tasks',
  calendar: 'Academic calendar',
  scenarios: 'Saved plans',
  planEditor: 'Plan editor',
  finance: 'Finance',
  feeDetail: 'Fee details',
  profile: 'Profile',
  demo: 'Demo data',
};

function Header({ title, showBack, onBack, onHome, isHome }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {showBack ? (
          <Button label="Back" variant="ghost" icon="arrow-back" onPress={onBack} style={styles.headerBack} />
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {!isHome ? <Button label="Home" variant="secondary" icon="home" onPress={onHome} /> : null}
    </View>
  );
}

function SaveIndicator({ saveStatus, storageProblem, onRetry, onDismiss }) {
  if (storageProblem) {
    return (
      <Banner label={storageProblem.message} tone="warn">
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <Button label="Retry save" variant="secondary" onPress={onRetry} />
          <View style={{ width: spacing.sm }} />
          <Button label="Dismiss" variant="ghost" onPress={onDismiss} />
        </View>
      </Banner>
    );
  }
  if (saveStatus === 'saving') return <Status label="Saving to this device…" tone="info" style={{ marginBottom: spacing.sm }} />;
  if (saveStatus === 'saved') return <Status label="Saved on this device" tone="ok" style={{ marginBottom: spacing.sm }} />;
  if (saveStatus === 'error') {
    return (
      <Banner label="The last change could not be written to this device. Your edit is only in memory until it saves." tone="danger">
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <Button label="Retry save" variant="secondary" onPress={onRetry} />
        </View>
      </Banner>
    );
  }
  return null;
}

export default function App() {
  const { state, hydrated, saveStatus, storageProblem, actions } = useAppData();
  const [nav, dispatch] = useReducer(navigationReducer, initialNavigation);

  const openView = useCallback((name, params = {}) => dispatch({ type: 'open', name, params }), []);
  const goBack = useCallback(() => dispatch({ type: 'back' }), []);
  const goHome = useCallback(() => dispatch({ type: 'home' }), []);

  // Android hardware Back follows the same rule as the Back button: pop the view
  // history, and let the OS close the app when already at Home.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack(nav)) {
        dispatch({ type: 'back' });
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [nav]);

  // A view can stop being valid after a semester switch or a demo data edit.
  const validity = useMemo(() => checkViewValidity(nav.view, state), [nav.view, state]);

  const renderView = () => {
    const { name, params } = nav.view;

    if (name === 'home') {
      return <HomeScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'courses') {
      return <CoursesScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'course') {
      return <CourseScreen state={state} actions={actions} openView={openView} params={params} />;
    }
    if (name === 'history') {
      return <HistoryScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'tasks') {
      return <TasksScreen state={state} actions={actions} openView={openView} params={params} />;
    }
    if (name === 'calendar') {
      return <CalendarScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'scenarios') {
      return <ScenariosScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'planEditor') {
      return <ScenarioEditor state={state} actions={actions} openView={openView} params={params} />;
    }
    if (name === 'finance') {
      return <FinanceScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'feeDetail') {
      return <FeeDetailScreen state={state} actions={actions} openView={openView} params={params} />;
    }
    if (name === 'profile') {
      return <ProfileScreen state={state} actions={actions} openView={openView} />;
    }
    if (name === 'demo') {
      return <DemoDataScreen state={state} actions={actions} openView={openView} />;
    }
    return (
      <Banner label={`This view ("${name}") does not exist in the demo dataset.`} tone="warn" />
    );
  };

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.loading}>
          <Text style={styles.loadingTitle}>Flex++</Text>
          <Text style={styles.loadingText}>Loading local demonstration data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isHome = nav.view.name === 'home';

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <Header
        title={VIEW_TITLES[nav.view.name] || 'Flex++'}
        showBack={canGoBack(nav)}
        onBack={goBack}
        onHome={goHome}
        isHome={isHome}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <SaveIndicator
            saveStatus={saveStatus}
            storageProblem={storageProblem}
            onRetry={actions.retrySave}
            onDismiss={actions.dismissStorageProblem}
          />

          {validity.valid ? null : (
            <Banner label={validity.reason} tone="warn">
              <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                <Button label="Back to courses" variant="secondary" onPress={() => openView('courses')} />
                <View style={{ width: spacing.sm }} />
                <Button label="Go home" variant="ghost" onPress={goHome} />
              </View>
            </Banner>
          )}

          {validity.valid ? renderView() : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy900,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.white, lineHeight: 26 },
  headerBack: { marginLeft: -spacing.md, marginBottom: 2, paddingHorizontal: 0 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy900 },
  loadingTitle: { fontSize: 30, fontWeight: '700', color: colors.white },
  loadingBody: { marginTop: spacing.sm, color: colors.surfaceSunken },
  loadingText: { fontSize: 15, color: colors.surfaceSunken },
});

export { VIEW_TITLES };
