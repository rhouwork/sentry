import React from 'react';
import Reflux from 'reflux';
import {Link} from 'react-router';
import {Sparklines, SparklinesLine} from 'react-sparklines';

import ApiMixin from '../mixins/apiMixin';
import {loadStats} from '../actionCreators/projects';

import GroupStore from '../stores/groupStore';
import TeamStore from '../stores/teamStore';

import BarChart from '../components/barChart';
import ActivityFeed from '../components/activity/feed';
import IssueList from '../components/issueList';
import LoadingError from '../components/loadingError';
import OrganizationHomeContainer from '../components/organizations/homeContainer';
import OrganizationState from '../mixins/organizationState';

import {t} from '../locale';
import {sortArray} from '../utils';

const AssignedIssues = React.createClass({
  propTypes: {
    statsPeriod: React.PropTypes.string,
    pageSize: React.PropTypes.number
  },


  getEndpoint() {
    return `/organizations/${this.props.params.orgId}/members/me/issues/assigned/?`;
  },

  getViewMoreLink() {
    return `/organizations/${this.props.params.orgId}/issues/assigned/`;
  },

  renderEmpty() {
    return <div className="box empty">{t('No issues have been assigned to you.')}</div>;
  },

  refresh() {
    this.refs.issueList.remountComponent();
  },

  render() {
    return (
      <div>
        <div className="pull-right">
          <Link className="btn btn-sm btn-default" to={this.getViewMoreLink()}>{t('View more')}</Link>
          <a className="btn btn-sm btn-default" style={{marginLeft: 5}}
             onClick={this.refresh}>
            <span className="icon icon-refresh" />
          </a>
        </div>
        <h4>Assigned to me</h4>
        <IssueList endpoint={this.getEndpoint()} query={{
          statsPeriod: this.props.statsPeriod,
          per_page: this.props.pageSize,
          status: 'unresolved',
        }} pagination={false} renderEmpty={this.renderEmpty}
           ref="issueList" {...this.props} />
      </div>
    );
  },
});

const NewIssues = React.createClass({
  propTypes: {
    statsPeriod: React.PropTypes.string,
    pageSize: React.PropTypes.number
  },

  getEndpoint() {
    return `/organizations/${this.props.params.orgId}/issues/new/`;
  },

  renderEmpty() {
    return <div className="box empty">{t('No new issues have been seen in the last week.')}</div>;
  },

  refresh() {
    this.refs.issueList.remountComponent();
  },

  render() {
    return (
      <div>
        <div className="pull-right">
          <a className="btn btn-sm btn-default" style={{marginLeft: 5}}
             onClick={this.refresh}>
            <span className="icon icon-refresh" />
          </a>
        </div>
        <h4>New this week</h4>
        <IssueList endpoint={this.getEndpoint()} query={{
          statsPeriod: this.props.statsPeriod,
          per_page: this.props.pageSize,
          status: 'unresolved',
        }} pagination={false} renderEmpty={this.renderEmpty}
           ref="issueList" {...this.props} />
      </div>
    );
  },
});

function ProjectSparkline(props) {
  let values = props.data.map(tuple => tuple[1]);

  return (
    <Sparklines data={values} width={100} height={32}>
      <SparklinesLine {...props} style={{stroke: '#25A6F7', fill: 'none', strokeWidth: 3}}/>
    </Sparklines>
  );
}
ProjectSparkline.propTypes = {
  data: React.PropTypes.array.isRequired
};

const ProjectList = React.createClass({
  propTypes: {
    teams: React.PropTypes.array,
    maxProjects: React.PropTypes.number
  },

  mixins: [OrganizationState],

  getDefaultProps() {
    return {
      maxProjects: 8
    };
  },

  render() {
    let org = this.getOrganization();
    let {maxProjects} = this.props;
    let projects = [];
    this.props.teams.forEach(team => {
      if (team.isMember) {
        team.projects.forEach(project => {
          projects.push({...project, teamName: team.name});
        });
      }
    });

    projects = sortArray(projects, (item) => {
      return [!item.isBookmarked, item.teamName, item.name];
    });

    // project list is
    // a) all bookmarked projects
    // b) if bookmarked projcets < maxProjects, then fill with sorted projects until maxProjects

    let bookmarkedProjects = projects.filter(p => p.isBookmarked);
    if (bookmarkedProjects.length < maxProjects) {
      projects = bookmarkedProjects.concat(projects.slice(bookmarkedProjects.length, maxProjects));
    } else {
      projects = bookmarkedProjects;
    }

    return (
      <div className="organization-dashboard-projects">
        <Link className="btn-sidebar-header" to={`/organizations/${org.slug}/teams/`}>View All</Link>
        <h6 className="nav-header">Projects</h6>
        {bookmarkedProjects.length === 0 &&
          <div className="alert alert-info" style={{marginBottom: 10}}>
            Bookmark your most used <Link to={`/organizations/${org.slug}/teams/`}>projects</Link> to have them appear here.
          </div>
        }
        <ul className="nav nav-stacked">
          {projects.map((project) => {
            return (
              <li key={project.id}>
                <div className="pull-right sparkline">
                  {project.stats &&
                    <ProjectSparkline data={project.stats} />
                  }
                </div>
                <Link to={`/${org.slug}/${project.slug}/`}>
                  <h4>
                    {project.isBookmarked && <span className="bookmark icon-star-solid" />}
                    {project.name}
                  </h4>
                  <h5>{project.teamName}</h5>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
});

const Activity = React.createClass({

  getEndpoint() {
    return `/organizations/${this.props.params.orgId}/activity/`;
  },

  render() {
    return (
      <div>
        <h4>Recent activity</h4>
        <ActivityFeed endpoint={this.getEndpoint()} query={{
          per_page: 10,
        }} pagination={false} {...this.props} />
      </div>
    );
  },
});

const EPH = React.createClass({

  mixins: [ApiMixin, OrganizationState],

  getInitialState() {
    let until = Math.floor(new Date().getTime() / 1000);
    let since = until - 3600 * 24;

    return {
      rawOrgData: {received: null, rejected: null, blacklisted: null},
      formattedData: null,
      querySince: since,
      queryUntil: until,
      error: false
    };
  },

  componentDidMount() {
    this.fetchData();
  },

  STAT_OPTS: ['received', 'rejected', 'blacklisted'],

  fetchData() {
    let statEndpoint = this.getEndpoint();

    let query = {
      since: this.state.querySince,
      until: this.state.queryUntil,
      resolution: '1h',
    };

    $.when.apply($, this.STAT_OPTS.map(stat => {
        let deferred = $.Deferred();
        this.api.request(statEndpoint, {
          query: Object.assign({stat: stat}, query),
          success: deferred.resolve.bind(deferred),
          error: deferred.reject.bind(deferred)
        });
        return deferred;
      }
    )).done(function() {
      let rawOrgData = {};
      for (let i = 0; i < this.STAT_OPTS.length; i++) {
        rawOrgData[this.STAT_OPTS[i]] = arguments[i][0];
      }
      this.setState(Object.assign({rawOrgData: rawOrgData}, this.getChartState(rawOrgData)));
    }.bind(this)).fail(function() {
      this.setState({error: true});
    }.bind(this));
  },

  getEndpoint() {
    return `/organizations/${this.props.params.orgId}/stats/`;
  },

  getChartState(rawData) {
    // TODO: make sure stats data is zero filled otherwise this will be wrong
    let chartData = [];
    let barClasses = [];
    for (let i = 0; i < rawData.received.length; i++) {
      let point = {x: rawData.received[i][0], y: []};
      for (let statType in rawData) {
        point.y.push(rawData[statType][i][1]);
        barClasses.push(statType);
      }
      chartData.push(point);
    }
    return {
      formattedData: chartData,
      barClasses: barClasses
    };
  },

  render() {
    if (this.state.error) {
      return <LoadingError />;
    }

    if (!this.state.formattedData) {
      return null;
    }
    let org = this.getOrganization();

    return (
      <div>
        <Link className="btn-sidebar-header" to={`/organizations/${org.slug}/stats/`}>{t('View Stats')}</Link>
        <h6 className="nav-header">{t('Events Per Hour')}</h6>
          <BarChart points={this.state.formattedData} className="sparkline" barClasses={this.state.barClasses} />
      </div>
    );
  },
});

const OrganizationDashboard = React.createClass({
  mixins: [
    ApiMixin,
    Reflux.listenTo(TeamStore, 'onTeamListChange'),
  ],

  getDefaultProps() {
    return {
      statsPeriod: '24h',
      pageSize: 5
    };
  },

  getInitialState() {
    return {
      teams: TeamStore.getAll()
    };
  },

  componentWillMount() {
    loadStats(this.api, {
      orgId: this.props.params.orgId,
      query: {
        since: new Date().getTime() / 1000 - 3600 * 24,
        stat: 'received',
        group: 'project'
      }
    });
  },

  componentWillUnmount() {
    GroupStore.reset();
  },


  onTeamListChange() {
    this.setState({
      teams: TeamStore.getAll()
    });
  },

  render() {
    return (
      <OrganizationHomeContainer>
        <div className="row">
          <div className="col-md-8">
            <AssignedIssues {...this.props} />
            <NewIssues {...this.props} />
            <Activity {...this.props} />
          </div>
          <div className="col-md-4">
            <EPH {...this.props}/>
            <hr />
            <ProjectList {...this.props} teams={this.state.teams} />
          </div>
        </div>
      </OrganizationHomeContainer>
    );
  },
});

export default OrganizationDashboard;
