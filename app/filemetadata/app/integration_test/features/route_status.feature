Feature: Route status integration test
  Background: Created necessary status configuration
    Given create config

  Scenario: Service-status endpoint response
    When service-status endpoint is called
    Then service-status response should have value {'status': 'ok'}
