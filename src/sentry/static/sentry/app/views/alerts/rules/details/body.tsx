import React from 'react';
import {browserHistory, RouteComponentProps} from 'react-router';
import styled from '@emotion/styled';
import {Location} from 'history';
import moment from 'moment';

import {Client} from 'app/api';
import Feature from 'app/components/acl/feature';
import Button from 'app/components/button';
import EventsRequest from 'app/components/charts/eventsRequest';
import {SectionHeading} from 'app/components/charts/styles';
import DropdownControl, {DropdownItem} from 'app/components/dropdownControl';
import Duration from 'app/components/duration';
import * as Layout from 'app/components/layouts/thirds';
import {Panel, PanelBody, PanelFooter} from 'app/components/panels';
import Placeholder from 'app/components/placeholder';
import {IconCheckmark} from 'app/icons/iconCheckmark';
import {IconFire} from 'app/icons/iconFire';
import {IconWarning} from 'app/icons/iconWarning';
import {t, tct} from 'app/locale';
import space from 'app/styles/space';
import {NewQuery, Organization, Project, SelectValue} from 'app/types';
import {defined} from 'app/utils';
import {getUtcDateString} from 'app/utils/dates';
import DiscoverQuery from 'app/utils/discover/discoverQuery';
import EventView from 'app/utils/discover/eventView';
import Projects from 'app/utils/projects';
import {DATASET_EVENT_TYPE_FILTERS} from 'app/views/settings/incidentRules/constants';
import {makeDefaultCta} from 'app/views/settings/incidentRules/incidentRulePresets';
import {
  AlertRuleThresholdType,
  Dataset,
  IncidentRule,
  TimePeriod,
  TimeWindow,
} from 'app/views/settings/incidentRules/types';
import {extractEventTypeFilterFromRule} from 'app/views/settings/incidentRules/utils/getEventTypeFilter';

import {Incident, IncidentStatus} from '../../types';
import {DATA_SOURCE_LABELS, getIncidentRuleMetricPreset} from '../../utils';

import MetricChart from './metricChart';
import RelatedIssues from './relatedIssues';

type Props = {
  api: Client;
  rule?: IncidentRule;
  incidents?: Incident[];
  organization: Organization;
  location: Location;
} & RouteComponentProps<{orgId: string}, {}>;

const TIME_OPTIONS: SelectValue<string>[] = [
  {label: t('6 hours'), value: TimePeriod.SIX_HOURS},
  {label: t('24 hours'), value: TimePeriod.ONE_DAY},
  {label: t('3 days'), value: TimePeriod.THREE_DAYS},
  {label: t('7 days'), value: TimePeriod.SEVEN_DAYS},
];

const TIME_WINDOWS = {
  [TimePeriod.SIX_HOURS]: TimeWindow.ONE_HOUR * 6 * 60 * 1000,
  [TimePeriod.ONE_DAY]: TimeWindow.ONE_DAY * 60 * 1000,
  [TimePeriod.THREE_DAYS]: TimeWindow.ONE_DAY * 3 * 60 * 1000,
  [TimePeriod.SEVEN_DAYS]: TimeWindow.ONE_DAY * 7 * 60 * 1000,
};

export default class DetailsBody extends React.Component<Props> {
  get metricPreset() {
    const {rule} = this.props;
    return rule ? getIncidentRuleMetricPreset(rule) : undefined;
  }

  /**
   * Return a string describing the threshold based on the threshold and the type
   */
  getThresholdText(
    value: number | '' | null | undefined,
    thresholdType?: AlertRuleThresholdType,
    isAlert: boolean = false
  ) {
    if (!defined(value) || !defined(thresholdType)) {
      return '';
    }

    const isAbove = thresholdType === AlertRuleThresholdType.ABOVE;
    const direction = isAbove === isAlert ? '>' : '<';

    return `${direction} ${value}`;
  }

  getTimePeriod() {
    const {location} = this.props;
    const now = moment.utc();

    const timePeriod = location.query.period ?? TimePeriod.ONE_DAY;
    const timeOption =
      TIME_OPTIONS.find(item => item.value === timePeriod) ?? TIME_OPTIONS[1];

    return {
      ...timeOption,
      start: getUtcDateString(moment(now.diff(TIME_WINDOWS[timeOption.value]))),
      end: getUtcDateString(now),
    };
  }

  handleTimePeriodChange = (value: string) => {
    const {location} = this.props;
    browserHistory.push({
      pathname: location.pathname,
      query: {
        ...location.query,
        period: value,
      },
    });
  };

  calculateSummaryPercentages(
    incidents: Incident[] | undefined,
    startTime: string,
    endTime: string,
    totalTime: number
  ) {
    let criticalPercent = '0';
    let warningPercent = '0';
    if (incidents) {
      const startDate = moment.utc(startTime);
      const filteredIncidents = incidents.filter(incident => {
        return !incident.dateClosed || moment(incident.dateClosed).isAfter(startDate);
      });
      let criticalDuration = 0;
      const warningDuration = 0;
      for (const incident of filteredIncidents) {
        // use the larger of the start of the incident or the start of the time period
        const incidentStart = moment.max(moment(incident.dateStarted), startDate);
        const incidentClose = incident.dateClosed
          ? moment(incident.dateClosed)
          : moment.utc(endTime);
        criticalDuration += incidentClose.diff(incidentStart);
      }
      criticalPercent = ((criticalDuration / totalTime) * 100).toFixed(2);
      warningPercent = ((warningDuration / totalTime) * 100).toFixed(2);
    }
    const resolvedPercent = (
      100 -
      (Number(criticalPercent) + Number(warningPercent))
    ).toFixed(2);

    return {criticalPercent, warningPercent, resolvedPercent};
  }

  renderRuleDetails() {
    const {rule} = this.props;

    if (rule === undefined) {
      return <Placeholder height="200px" />;
    }

    const criticalTrigger = rule?.triggers.find(({label}) => label === 'critical');
    const warningTrigger = rule?.triggers.find(({label}) => label === 'warning');

    return (
      <RuleDetails>
        <span>{t('Data Source')}</span>
        <span>{rule?.dataset && DATA_SOURCE_LABELS[rule?.dataset]}</span>

        <span>{t('Metric')}</span>
        <span>{rule?.aggregate}</span>

        <span>{t('Time Window')}</span>
        <span>{rule?.timeWindow && <Duration seconds={rule?.timeWindow * 60} />}</span>

        {rule?.query && (
          <React.Fragment>
            <span>{t('Filter')}</span>
            <span title={rule?.query}>{rule?.query}</span>
          </React.Fragment>
        )}

        <span>{t('Critical Trigger')}</span>
        <span>
          {this.getThresholdText(
            criticalTrigger?.alertThreshold,
            rule?.thresholdType,
            true
          )}
        </span>

        {defined(warningTrigger) && (
          <React.Fragment>
            <span>{t('Warning Trigger')}</span>
            <span>
              {this.getThresholdText(
                warningTrigger?.alertThreshold,
                rule?.thresholdType,
                true
              )}
            </span>
          </React.Fragment>
        )}

        {defined(rule?.resolveThreshold) && (
          <React.Fragment>
            <span>{t('Resolution')}</span>
            <span>
              {this.getThresholdText(rule?.resolveThreshold, rule?.thresholdType)}
            </span>
          </React.Fragment>
        )}
      </RuleDetails>
    );
  }

  renderSummaryStatItems({
    criticalPercent,
    warningPercent,
    resolvedPercent,
  }: {
    criticalPercent: string;
    warningPercent: string;
    resolvedPercent: string;
  }) {
    return (
      <React.Fragment>
        <StatItem>
          <IconFire color="red300" />
          <StatCount>{criticalPercent}%</StatCount>
        </StatItem>
        <StatItem>
          <IconWarning color="yellow300" />
          <StatCount>{warningPercent}%</StatCount>
        </StatItem>
        <StatItem>
          <IconCheckmark color="green300" />
          <StatCount>{resolvedPercent}%</StatCount>
        </StatItem>
      </React.Fragment>
    );
  }

  renderChartActions(projects: Project[]) {
    const {rule, params, incidents} = this.props;
    const timePeriod = this.getTimePeriod();
    const preset = this.metricPreset;
    const ctaOpts = {
      orgSlug: params.orgId,
      projects,
      rule,
      start: timePeriod.start,
      end: timePeriod.end,
    };

    const {buttonText, ...props} = preset
      ? preset.makeCtaParams(ctaOpts)
      : makeDefaultCta(ctaOpts);

    const percentages = this.calculateSummaryPercentages(
      incidents,
      timePeriod.start,
      timePeriod.end,
      TIME_WINDOWS[timePeriod.value]
    );

    return (
      <ChartActions>
        <ChartSummary>
          <SummaryText>{t('SUMMARY')}</SummaryText>
          <SummaryStats>{this.renderSummaryStatItems(percentages)}</SummaryStats>
        </ChartSummary>
        <Feature features={['discover-basic']}>
          <Button size="small" priority="primary" disabled={!rule} {...props}>
            {buttonText}
          </Button>
        </Feature>
      </ChartActions>
    );
  }

  renderLoading() {
    return (
      <Layout.Body>
        <Layout.Main>
          <Placeholder height="38px" />
          <ChartPanel>
            <PanelBody withPadding>
              <Placeholder height="200px" />
            </PanelBody>
          </ChartPanel>
        </Layout.Main>
        <Layout.Side>
          <SidebarHeading>
            <span>{t('Alert Rule')}</span>
          </SidebarHeading>
          {this.renderRuleDetails()}
        </Layout.Side>
      </Layout.Body>
    );
  }

  render30DaySummary(
    query: string,
    projects: number[],
    environment: string[] | undefined
  ) {
    const {incidents, location, organization} = this.props;

    // get current status
    const activeIncident = incidents?.find(({dateClosed}) => !dateClosed);
    const status = activeIncident ? activeIncident.status : IncidentStatus.CLOSED;
    let statusText = t('Resolved');
    let statusIcon = <IconCheckmark color="white" />;
    if (status === IncidentStatus.CRITICAL) {
      statusText = t('Critical');
      statusIcon = <IconFire color="white" />;
    } else if (status === IncidentStatus.WARNING) {
      statusText = t('Warning');
      statusIcon = <IconWarning color="white" />;
    }

    const eventUserCountQuery: NewQuery = {
      id: undefined,
      version: 2,
      name: 'eventsUserEventView',
      query,
      projects,
      environment,
      range: '30d',
      fields: ['count()', 'count_unique(user.id)'],
    };

    const eventUserEventView = EventView.fromSavedQuery(eventUserCountQuery);

    const now = moment.utc();
    const totalTime = TimeWindow.ONE_DAY * 30 * 60 * 1000;
    const start = getUtcDateString(moment(now.diff(totalTime)));
    const end = getUtcDateString(now);

    const percentages = this.calculateSummaryPercentages(
      incidents,
      start,
      end,
      totalTime
    );

    return (
      <React.Fragment>
        <DiscoverQuery
          location={location}
          orgSlug={organization.slug}
          eventView={eventUserEventView}
        >
          {({isLoading, tableData}) => {
            let eventCount, userCount;
            if (!isLoading && tableData?.data) {
              const {count, count_unique_user_id} = tableData.data[0];
              eventCount = count;
              userCount = count_unique_user_id;
            }
            return (
              <GroupedHeaderItems>
                <ItemTitle>{t('Current Status')}</ItemTitle>
                <ItemTitle>{t('Events')}</ItemTitle>
                <ItemTitle>{t('Users')}</ItemTitle>
                <IncidentStatusItemValue status={status}>
                  <IconBackdrop status={status}>{statusIcon}</IconBackdrop> {statusText}
                </IncidentStatusItemValue>
                <ItemValue>{eventCount ?? <Placeholder height="24px" />}</ItemValue>
                <ItemValue>{userCount ?? <Placeholder height="24px" />}</ItemValue>
              </GroupedHeaderItems>
            );
          }}
        </DiscoverQuery>
        <ItemTitle>{t('Last 30 Days')}</ItemTitle>
        <SidebarSummaryStats>
          {this.renderSummaryStatItems(percentages)}
        </SidebarSummaryStats>
      </React.Fragment>
    );
  }

  render() {
    const {
      api,
      rule,
      incidents,
      organization,
      params: {orgId},
    } = this.props;

    if (!rule) {
      return this.renderLoading();
    }

    const {query, environment, aggregate, projects: projectSlugs} = rule;
    const timePeriod = this.getTimePeriod();
    const queryWithTypeFilter = `${query} ${extractEventTypeFilterFromRule(rule)}`.trim();

    return (
      <Projects orgId={orgId} slugs={projectSlugs}>
        {({initiallyLoaded, projects}) => {
          return initiallyLoaded ? (
            <Layout.Body>
              <Layout.Main>
                <DropdownControl
                  buttonProps={{prefix: t('Display')}}
                  label={timePeriod.label}
                >
                  {TIME_OPTIONS.map(({label, value}) => (
                    <DropdownItem
                      key={value}
                      eventKey={value}
                      onSelect={this.handleTimePeriodChange}
                    >
                      {label}
                    </DropdownItem>
                  ))}
                </DropdownControl>
                <ChartPanel>
                  <PanelBody withPadding>
                    <ChartHeader>
                      {this.metricPreset?.name ?? t('Custom metric')}
                    </ChartHeader>
                    <EventsRequest
                      api={api}
                      organization={organization}
                      query={queryWithTypeFilter}
                      environment={environment ? [environment] : undefined}
                      project={(projects as Project[]).map(project => Number(project.id))}
                      // TODO(davidenwang): allow interval to be changed for larger time periods
                      interval="60s"
                      period={timePeriod.value}
                      yAxis={aggregate}
                      includePrevious={false}
                      currentSeriesName={aggregate}
                    >
                      {({loading, timeseriesData}) =>
                        !loading && timeseriesData ? (
                          <MetricChart data={timeseriesData} incidents={incidents} />
                        ) : (
                          <Placeholder height="200px" />
                        )
                      }
                    </EventsRequest>
                  </PanelBody>
                  {this.renderChartActions(projects as Project[])}
                </ChartPanel>
                <DetailWrapper>
                  <ActivityWrapper>
                    {rule?.dataset === Dataset.ERRORS && (
                      <RelatedIssues
                        organization={organization}
                        rule={rule}
                        projects={((projects as Project[]) || []).filter(project =>
                          rule.projects.includes(project.slug)
                        )}
                        start={timePeriod.start}
                        end={timePeriod.end}
                        filter={queryWithTypeFilter}
                      />
                    )}
                  </ActivityWrapper>
                </DetailWrapper>
              </Layout.Main>
              <Layout.Side>
                {this.render30DaySummary(
                  queryWithTypeFilter,
                  (projects as Project[]).map(p => Number(p.id)),
                  environment ? [environment] : undefined
                )}
                <ChartParameters>
                  {tct('Metric: [metric] over [window]', {
                    metric: <code>{rule?.aggregate ?? '\u2026'}</code>,
                    window: (
                      <code>
                        {rule?.timeWindow ? (
                          <Duration seconds={rule?.timeWindow * 60} />
                        ) : (
                          '\u2026'
                        )}
                      </code>
                    ),
                  })}
                  {(rule?.query || rule?.dataset) &&
                    tct('Filter: [datasetType] [filter]', {
                      datasetType: rule?.dataset && (
                        <code>{DATASET_EVENT_TYPE_FILTERS[rule.dataset]}</code>
                      ),
                      filter: rule?.query && <code>{rule.query}</code>,
                    })}
                </ChartParameters>
                <SidebarHeading>
                  <span>{t('Alert Rule')}</span>
                </SidebarHeading>
                {this.renderRuleDetails()}
              </Layout.Side>
            </Layout.Body>
          ) : (
            <Placeholder height="200px" />
          );
        }}
      </Projects>
    );
  }
}

const DetailWrapper = styled('div')`
  display: flex;
  flex: 1;

  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    flex-direction: column-reverse;
  }
`;

const ActivityWrapper = styled('div')`
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
`;

const GroupedHeaderItems = styled('div')`
  display: grid;
  grid-template-columns: repeat(3, max-content);
  grid-gap: ${space(1)} ${space(4)};
  text-align: right;
  margin-top: ${space(1)};
  margin-bottom: ${space(4)};
`;

const ItemTitle = styled('h6')`
  font-size: ${p => p.theme.fontSizeSmall};
  margin-bottom: 0;
  text-transform: uppercase;
  color: ${p => p.theme.gray300};
  letter-spacing: 0.1px;
`;

const ItemValue = styled('div')`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  font-size: ${p => p.theme.fontSizeExtraLarge};
`;

const IncidentStatusItemValue = styled(ItemValue)<{status: IncidentStatus}>`
  color: ${p =>
    p.status === IncidentStatus.WARNING
      ? p.theme.yellow300
      : p.status === IncidentStatus.CRITICAL
      ? p.theme.red300
      : p.theme.green300};
`;

const IconBackdrop = styled('div')<{status: IncidentStatus}>`
  position: relative;
  z-index: 0;
  margin-right: ${space(1.5)};

  &:before {
    display: block;
    content: '';
    width: 20px;
    height: 20px;
    top: 1px;
    left: -2px;
    border-radius: 2px;
    background-color: ${p =>
      p.status === IncidentStatus.WARNING
        ? p.theme.yellow300
        : p.status === IncidentStatus.CRITICAL
        ? p.theme.red300
        : p.theme.green300};
    position: absolute;
    transform: rotate(45deg);
    z-index: -1;
  }
`;

const SidebarHeading = styled(SectionHeading)`
  display: flex;
  justify-content: space-between;
`;

const ChartPanel = styled(Panel)`
  margin-top: ${space(2)};
`;

const ChartHeader = styled('header')`
  margin-bottom: ${space(1)};
`;

const ChartActions = styled(PanelFooter)`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: ${space(2)};
`;

const ChartSummary = styled('div')`
  display: flex;
  margin-right: auto;
`;

const SummaryText = styled('span')`
  margin-top: ${space(0.25)};
  font-weight: bold;
  font-size: ${p => p.theme.fontSizeSmall};
`;

const SummaryStats = styled('div')`
  display: flex;
  align-items: center;
  margin: 0 ${space(2)};
`;

const SidebarSummaryStats = styled(SummaryStats)`
  margin: 0 0 ${space(4)} 0;
  font-size: ${p => p.theme.fontSizeMedium};
`;

const StatItem = styled('div')`
  display: flex;
  align-items: center;
  margin: 0 ${space(2)} 0 0;
`;

const StatCount = styled('span')`
  margin-left: ${space(0.5)};
  margin-top: ${space(0.25)};
  color: black;
`;

const ChartParameters = styled('div')`
  color: ${p => p.theme.subText};
  font-size: ${p => p.theme.fontSizeMedium};
  align-items: center;
  overflow-x: auto;

  > * {
    position: relative;
  }

  > *:not(:last-of-type):after {
    content: '';
    display: block;
    height: 70%;
    width: 1px;
    background: ${p => p.theme.gray200};
    position: absolute;
    right: -${space(2)};
    top: 15%;
  }
`;

const RuleDetails = styled('div')`
  display: grid;
  font-size: ${p => p.theme.fontSizeSmall};
  grid-template-columns: auto max-content;
  margin-bottom: ${space(2)};

  & > span {
    padding: ${space(0.5)} ${space(1)};
  }

  & > span:nth-child(2n + 1) {
    width: 125px;
  }

  & > span:nth-child(2n + 2) {
    text-align: right;
    width: 215px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  & > span:nth-child(4n + 1),
  & > span:nth-child(4n + 2) {
    background-color: ${p => p.theme.rowBackground};
  }
`;
