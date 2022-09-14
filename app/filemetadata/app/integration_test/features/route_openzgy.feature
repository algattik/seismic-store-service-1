Feature: Route openzgy integration test
  Background: Created necessary openzgy configuration
    Given create config
    And create subproject
    And create dataset with id integration_test_dataset.zgy
    And upload dataset with id integration_test_dataset.zgy

  Scenario: Bingrid endpoint response
    When bingrid endpoint is called
    Then bingrid response should have value integration_test_bingrid_response.json

